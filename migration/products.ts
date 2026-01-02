const PRODUCT_OPTIONS_PATH = './migration/data/product-options.json';
const ERRORS_PATH = './migration/data/product-migration-errors.json';
const DRY_RUN = process.env.DRY_RUN === 'true';
const START_INDEX = process.env.START_INDEX ? parseInt(process.env.START_INDEX, 10) : 0;
const RATE_LIMIT_DELAY = 500; // ms between API calls
const API_VERSION = '2024-10';

// Environment validation
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_CLI_TOKEN = process.env.SHOPIFY_CLI_TOKEN;

if (!SHOPIFY_STORE) {
  console.error('❌ Missing SHOPIFY_STORE environment variable');
  process.exit(1);
}

if (!SHOPIFY_CLI_TOKEN) {
  console.error('❌ Missing SHOPIFY_CLI_TOKEN environment variable');
  console.error('\n📝 To get a token, run this command first:');
  console.error('   shopify auth login');
  console.error('\nThen get the token from ~/.config/shopify/shop.json');
  console.error('Or set SHOPIFY_CLI_TOKEN in your .env file');
  process.exit(1);
}

// Types
interface ProductOptions {
  [productCode: string]: {
    optionName: string;
    optionValue: string;
    priceDiff: number;
  }[];
}

interface Product {
  code: string;
  title: string;
  description: string;
  description_short: string;
  seo_description: string;
  seo_title: string;
  handle: string;
  price: number;
  compare_at_price: number | null;
  weight: number;
  inventory: number;
  image_url: string;
  image_alt: string;
  category_ids: string[];
  option_ids: string[];
  vendor: string;
  barcode: string;
  manufacturer: string;
  original_data: {
    features: string;
    tech_specs: string;
    extended_info: string;
    keywords: string;
    tech_specs_links?: string[];
  };
}

interface FileMapping {
  old_url: string;
  new_url: string;
  type: string;
  filename?: string;
  uploaded_at: string;
}

interface FileMappings {
  [oldUrl: string]: FileMapping;
}

interface CategoryMapping {
  volusionId: string;
  shopifyGid: string;
  handle: string;
  title: string;
}

interface ProductMapping {
  volusionCode: string;
  shopifyGid: string;
  shopify_product_id: string;
  shopifyUrl: string;
  handle: string;
  title: string;
  variantId?: string;
}

interface ProductError {
  code: string;
  title: string;
  error: string;
  timestamp: string;
}

// Utility functions
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getShopifyProductId(gid: string): string {
  // Extract numeric ID from GID like "gid://shopify/Product/8727563796678"
  return gid.split('/').pop() || '';
}

function getShopifyProductUrl(gid: string): string {
  const id = getShopifyProductId(gid);
  return `https://${SHOPIFY_STORE}/admin/products/${id}`;
}

async function getFirstLocationId(): Promise<string> {
  const result = await shopifyREST('/locations.json');
  if (result.locations && result.locations.length > 0) {
    return `gid://shopify/Location/${result.locations[0].id}`;
  }
  throw new Error('Could not find any locations in Shopify store.');
}

function replaceFileUrls(html: string, fileMappings: FileMappings): string {
  if (!html) return '';

  let result = html;

  // Replace each mapped URL
  for (const [oldUrl, mapping] of Object.entries(fileMappings)) {
    // Try exact match first
    result = result.replaceAll(oldUrl, mapping.new_url);

    // Try with http:// variant
    const httpUrl = oldUrl.replace('https://', 'http://');
    result = result.replaceAll(httpUrl, mapping.new_url);

    // Try with https:// variant
    const httpsUrl = oldUrl.replace('http://', 'https://');
    result = result.replaceAll(httpsUrl, mapping.new_url);
  }

  return result;
}

// GraphQL queries and mutations
const CREATE_PRODUCT_WITH_VARIANTS_MUTATION = `
  mutation productCreate($input: ProductInput!, $media: [CreateMediaInput!]) {
    productCreate(input: $input, media: $media) {
      product {
        id
        title
        handle
        variants(first: 10) {
          edges {
            node {
              id
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const ASSIGN_TO_COLLECTION_MUTATION = `
  mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
    collectionAddProducts(id: $id, productIds: $productIds) {
      collection {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function shopifyGraphQL(query: string, variables: any = {}): Promise<any> {
  const url = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_CLI_TOKEN!,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = await response.json() as any;

  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json;
}

async function shopifyREST(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
  const url = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}${endpoint}`;

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_CLI_TOKEN!,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return await response.json();
}

async function getFirstLocationId(): Promise<string> {
    const result = await shopifyREST('/locations.json');
    if (result.locations && result.locations.length > 0) {
      return `gid://shopify/Location/${result.locations[0].id}`;
    }
    throw new Error('Could not find any locations in Shopify store.');
  }

async function createProduct(
  product: Product,
  fileMappings: FileMappings,
  categoryMappings: Map<string, string>,
  productOptions: ProductOptions,
  locationId: string
): Promise<{ id: string; handle: string; variantId?: string } | null> {

  // Replace file URLs in all content
  const description = replaceFileUrls(product.description, fileMappings);
  const features = product.original_data.features;
  const techSpecs = product.original_data.tech_specs;
  const extendedInfo = product.original_data.extended_info;

  // Get Shopify collection IDs
  const collectionIds = product.category_ids
    .map(catId => categoryMappings.get(catId))
    .filter(Boolean) as string[];

  // Convert pounds to grams (Shopify uses grams)
  const weightInGrams = Math.round(product.weight * 453.592);

  const productVariants = productOptions[product.code];
  const hasVariants = productVariants && productVariants.length > 0;

  const input: any = {
    title: product.title,
    handle: product.handle,
    descriptionHtml: description,
    vendor: product.vendor || product.manufacturer || '',
    productType: '',
    status: 'ACTIVE',
    seo: {
      title: product.seo_title || product.title,
      description: product.seo_description || '',
    },
  };

  if (hasVariants) {
    input.options = [...new Set(productVariants.map(v => v.optionName))];
    input.variants = productVariants.map(variant => ({
      options: [variant.optionValue],
      price: (product.price + variant.priceDiff).toFixed(2),
      sku: `${product.code}-${variant.optionValue.replace(/[^a-zA-Z0-9]/g, '')}`,
      barcode: product.barcode || null,
      weight: weightInGrams,
      weightUnit: 'GRAMS',
      inventoryPolicy: 'DENY',
    }));
  } else {
    input.variants = [{
      price: product.price.toFixed(2),
      compareAtPrice: product.compare_at_price && product.compare_at_price > product.price
        ? product.compare_at_price.toFixed(2)
        : null,
      sku: product.code,
      barcode: product.barcode || null,
      weight: weightInGrams,
      weightUnit: 'GRAMS',
      inventoryPolicy: 'DENY',
    }];
  }

  // Prepare media for product image
  const media: any[] = [];
  if (product.image_url) {
    const newImageUrl = fileMappings[product.image_url]?.new_url || product.image_url;
    media.push({
      alt: product.image_alt || product.title,
      mediaContentType: 'IMAGE',
      originalSource: newImageUrl,
    });
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would create product:`, {
      title: input.title,
      handle: input.handle,
      price: product.price,
      collections: collectionIds.length,
      variants: input.variants.length
    });
    return {
      id: `gid://shopify/Product/dry-run-${product.code}`,
      handle: product.handle,
      variantId: `gid://shopify/ProductVariant/dry-run-${product.code}`
    };
  }

  try {
    // Create product with media and variants
    const variables: any = { input };
    if (media.length > 0) {
      variables.media = media;
    }

    const result = await shopifyGraphQL(CREATE_PRODUCT_WITH_VARIANTS_MUTATION, variables);

    if (result.data?.productCreate?.userErrors?.length > 0) {
      console.error(`      ❌ Error creating product:`, result.data.productCreate.userErrors);
      return null;
    }

    const createdProduct = result.data?.productCreate?.product;
    if (!createdProduct) {
      console.error(`      ❌ No product returned`);
      return null;
    }

    console.log(`      ✓ Product created: ${createdProduct.handle}`);

    // Set metafields via REST API
    const productNumericId = createdProduct.id.split('/').pop();
    if (productNumericId) {
        const metafields = [
            { namespace: 'custom', key: 'features', value: features, type: 'multi_line_text_field' },
            { namespace: 'custom', key: 'technical_specifications', value: techSpecs, type: 'json' },
            { namespace: 'custom', key: 'datasheet', value: JSON.stringify(product.original_data.tech_specs_links), type: 'list.file_reference' },
            { namespace: 'custom', key: 'extended_information', value: extendedInfo, type: 'multi_line_text_field' },
            { namespace: 'custom', key: 'volusion_product_code', value: product.code, type: 'single_line_text_field' }
        ];

        for (const metafield of metafields) {
            if (metafield.value) {
                try {
                    await shopifyREST(`/products/${productNumericId}/metafields.json`, 'POST', { metafield });
                    console.log(`      🏷️  Metafield set: ${metafield.key}`);
                } catch (metafieldError: any) {
                    console.log(`      ⚠️  Warning: Failed to set metafield ${metafield.key}:`, metafieldError.message);
                }
            }
        }
    }


    // Assign to collections
    if (collectionIds.length > 0) {
      let assignedCount = 0;
      for (const collectionId of collectionIds) {
        try {
          const collectionResult = await shopifyGraphQL(ASSIGN_TO_COLLECTION_MUTATION, {
            id: collectionId,
            productIds: [createdProduct.id]
          });

          if (collectionResult.data?.collectionAddProducts?.userErrors?.length > 0) {
            console.error(`      ⚠️  Failed to add to collection ${collectionId}:`,
              collectionResult.data.collectionAddProducts.userErrors);
          } else {
            assignedCount++;
          }
        } catch (error: any) {
          console.error(`      ⚠️  Exception adding to collection ${collectionId}:`, error.message);
        }
      }
      console.log(`      🏷️  Assigned to ${assignedCount}/${collectionIds.length} collections`);
    }

    return {
      id: createdProduct.id,
      handle: createdProduct.handle,
      variantId: createdProduct.variants?.edges?.[0]?.node?.id || undefined
    };
  } catch (error: any) {
    console.error(`      ❌ Exception creating product:`, error.message);
    return null;
  }
}

// Main migration function
async function migrateProducts() {
  console.log('🚀 Starting product migration...\n');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN' : '🔴 LIVE'}\n`);
  console.log(`Store: ${SHOPIFY_STORE}\n`);

  // Step 1: Load products
  console.log('📖 Loading products:', PRODUCTS_PATH);
  const productsContent = readFileSync(PRODUCTS_PATH, 'utf-8');
  const products = JSON.parse(productsContent) as Product[];
  console.log(`✓ Loaded ${products.length} products\n`);

  // Step 2: Load file mappings
  console.log('📖 Loading file mappings:', FILE_MAPPING_PATH);
  const fileMappingsContent = readFileSync(FILE_MAPPING_PATH, 'utf-8');
  const fileMappings = JSON.parse(fileMappingsContent) as FileMappings;
  console.log(`✓ Loaded ${Object.keys(fileMappings).length} file mappings\n`);

  // Step 3: Load category mappings
  console.log('📖 Loading category mappings:', CATEGORY_MAPPING_PATH);
  const categoryMappingsContent = readFileSync(CATEGORY_MAPPING_PATH, 'utf-8');
  const categoryMappingsArray = JSON.parse(categoryMappingsContent) as CategoryMapping[];
  const categoryMappings = new Map<string, string>();
  for (const mapping of categoryMappingsArray) {
    categoryMappings.set(mapping.volusionId, mapping.shopifyGid);
  }
  console.log(`✓ Loaded ${categoryMappings.size} category mappings\n`);

  // Step 3a: Load product options
  console.log('📖 Loading product options:', PRODUCT_OPTIONS_PATH);
  const productOptionsContent = readFileSync(PRODUCT_OPTIONS_PATH, 'utf-8');
  const productOptions = JSON.parse(productOptionsContent) as ProductOptions;
  console.log(`✓ Loaded ${Object.keys(productOptions).length} product options\n`);

  const locationId = await getFirstLocationId();
  console.log(`✓ Using location ID: ${locationId}\n`);

  // Step 4: Load existing product mappings to prevent duplicates
  let existingMappings = new Map<string, ProductMapping>();
  try {
    const existingContent = readFileSync(PRODUCT_MAPPING_PATH, 'utf-8');
    const existingArray = JSON.parse(existingContent) as ProductMapping[];
    for (const mapping of existingArray) {
      existingMappings.set(mapping.volusionCode, mapping);
    }
    console.log(`✓ Found ${existingMappings.size} existing product mappings\n`);
  } catch (error) {
    console.log(`ℹ️  No existing product mappings found (will create new file)\n`);
  }

  // Step 5: Filter products to migrate (skip already migrated)
  const productsToMigrate = products.filter(p => !existingMappings.has(p.code));

  // Apply START_INDEX if specified
  let startFrom = 0;
  if (START_INDEX > 0) {
    if (START_INDEX >= productsToMigrate.length) {
      console.log(`❌ START_INDEX (${START_INDEX}) is beyond the number of products to migrate (${productsToMigrate.length})\n`);
      return;
    }
    startFrom = START_INDEX;
    console.log(`⏭️  Starting from index ${START_INDEX} (skipping first ${START_INDEX} products)\n`);
  }

  const productsToProcess = productsToMigrate.slice(startFrom);
  console.log(`✓ Will migrate ${productsToProcess.length} products (${existingMappings.size} already exist, ${startFrom} skipped)\n`);

  if (productsToProcess.length === 0) {
    console.log('✨ All products already migrated!\n');
    return;
  }

  // Step 6: Load existing errors
  let errors: ProductError[] = [];
  try {
    const errorsContent = readFileSync(ERRORS_PATH, 'utf-8');
    errors = JSON.parse(errorsContent) as ProductError[];
    console.log(`✓ Loaded ${errors.length} existing errors\n`);
  } catch (error) {
    console.log(`ℹ️  No existing errors found\n`);
  }

  // Step 7: Migrate products
  const mappings: ProductMapping[] = Array.from(existingMappings.values());
  let successCount = existingMappings.size;
  let errorCount = 0;

  console.log('🔄 Creating products...\n');
  if (START_INDEX > 0) {
    console.log(`Starting at index ${START_INDEX} of ${productsToMigrate.length} total products to migrate\n`);
  }
  console.log('='.repeat(60) + '\n');

  for (let i = 0; i < productsToProcess.length; i++) {
    const product = productsToProcess[i];
    const globalIndex = startFrom + i;

    console.log(`[${globalIndex + 1}/${productsToMigrate.length}] Processing "${product.title}"`);
    console.log(`   Code: ${product.code} | Price: $${product.price} | Categories: ${product.category_ids.length}`);

    const result = await createProduct(product, fileMappings, categoryMappings, productOptions, locationId);

    if (result) {
      const newMapping: ProductMapping = {
        volusionCode: product.code,
        shopifyGid: result.id,
        shopify_product_id: getShopifyProductId(result.id),
        shopifyUrl: getShopifyProductUrl(result.id),
        handle: result.handle,
        title: product.title,
        variantId: result.variantId,
      };
      mappings.push(newMapping);
      successCount++;

      // Save mapping immediately
      writeFileSync(PRODUCT_MAPPING_PATH, JSON.stringify(mappings, null, 2));

      console.log(`   ✓ Complete\n`);
    } else {
      errorCount++;

      // Save error to errors array
      if (!DRY_RUN) {
        errors.push({
          code: product.code,
          title: product.title,
          error: 'Failed to create product - see logs for details',
          timestamp: new Date().toISOString(),
        });

        // Write errors immediately
        writeFileSync(ERRORS_PATH, JSON.stringify(errors, null, 2));
      }

      console.log(`   ✗ Failed\n`);
    }

    // Rate limiting
    if (!DRY_RUN) {
      await sleep(RATE_LIMIT_DELAY);
    }
  }

  // Summary
  console.log('='.repeat(60));
  console.log('✨ Migration Complete!\n');
  console.log(`Total products processed: ${products.length}`);
  console.log(`✓ Successful: ${successCount}`);
  console.log(`✗ Failed: ${errorCount}`);
  console.log(`\nMapping saved to: ${PRODUCT_MAPPING_PATH}`);
  if (errorCount > 0) {
    console.log(`Errors saved to: ${ERRORS_PATH}`);
  }
  console.log('='.repeat(60));
}

// Run migration
migrateProducts().catch(error => {
  console.error('\n❌ Migration failed:', error);
  process.exit(1);
});
