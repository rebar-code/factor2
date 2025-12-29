import { readFileSync, writeFileSync } from 'fs';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration
const PRODUCTS_PATH = './migration/data/products.json';
const PRODUCT_MAPPING_PATH = './migration/product-mapping.json';
const CATEGORY_MAPPING_PATH = './migration/category-mapping.json';
const DRY_RUN = process.env.DRY_RUN === 'true';
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
  process.exit(1);
}

// Types
interface Product {
  code: string;
  title: string;
  price: number;
  compare_at_price: number | null;
  weight: number;
  category_ids: string[];
  barcode: string;
}

interface ProductMapping {
  volusionCode: string;
  shopifyGid: string;
  shopify_product_id: string;
  variantId?: string;
}

interface CategoryMapping {
  volusionId: string;
  shopifyGid: string;
}

// Utility functions
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// GraphQL mutations
const UPDATE_PRODUCT_MUTATION = `
  mutation productSet($input: ProductSetInput!) {
    productSet(input: $input) {
      product {
        id
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

async function updateProduct(
  productGid: string,
  variantId: string | undefined,
  product: Product,
  categoryMappings: Map<string, string>
): Promise<boolean> {
  // Convert pounds to grams
  const weightInGrams = Math.round(product.weight * 453.592);

  // Get Shopify collection IDs
  const collectionIds = product.category_ids
    .map(catId => categoryMappings.get(catId))
    .filter(Boolean) as string[];

  // Extract numeric IDs from GIDs
  const productId = productGid.split('/').pop();
  const variantNumericId = variantId ? variantId.split('/').pop() : null;

  const input: any = {
    id: productGid,
    metafields: [
      {
        namespace: 'custom',
        key: 'volusion_product_code',
        value: product.code,
        type: 'single_line_text_field',
      },
    ],
  };

  if (DRY_RUN) {
    console.log(`      [DRY RUN] Would update product with:`, {
      price: product.price,
      weight: `${weightInGrams}g (${product.weight} lbs)`,
      collections: collectionIds.length,
      metafield: product.code,
    });
    return true;
  }

  try {
    // Update product metafield via REST API (GraphQL metafields require definition first)
    const metafieldData = {
      metafield: {
        namespace: 'custom',
        key: 'volusion_product_code',
        value: product.code,
        type: 'single_line_text_field',
      }
    };

    try {
      await shopifyREST(`/products/${productId}/metafields.json`, 'POST', metafieldData);
      console.log(`      ✓ Updated metafield`);
    } catch (metafieldError: any) {
      console.log(`      ⚠️  Metafield warning:`, metafieldError.message);
    }

    // Update variant details via REST API
    if (variantNumericId) {
      const variantData = {
        variant: {
          id: variantNumericId,
          price: product.price.toFixed(2),
          compare_at_price: product.compare_at_price && product.compare_at_price > product.price
            ? product.compare_at_price.toFixed(2)
            : null,
          sku: product.code,
          barcode: product.barcode || null,
          weight: weightInGrams,
          weight_unit: 'g',
          inventory_policy: 'deny',
        }
      };

      const variantResult = await shopifyREST(`/variants/${variantNumericId}.json`, 'PUT', variantData);
      console.log(`      ✓ Updated variant (price: $${product.price}, weight: ${weightInGrams}g)`);
    }

    // Assign to collections
    if (collectionIds.length > 0) {
      let assignedCount = 0;
      for (const collectionId of collectionIds) {
        try {
          const collectionResult = await shopifyGraphQL(ASSIGN_TO_COLLECTION_MUTATION, {
            id: collectionId,
            productIds: [productGid]
          });

          if (collectionResult.data?.collectionAddProducts?.userErrors?.length > 0) {
            console.error(`      ⚠️  Failed to add to collection:`,
              collectionResult.data.collectionAddProducts.userErrors);
          } else {
            assignedCount++;
          }
        } catch (error: any) {
          console.error(`      ⚠️  Exception adding to collection:`, error.message);
        }
      }
      console.log(`      🏷️  Assigned to ${assignedCount}/${collectionIds.length} collections`);
    }

    return true;
  } catch (error: any) {
    console.error(`      ❌ Exception updating product:`, error.message);
    return false;
  }
}

async function updateExistingProducts() {
  console.log('🔄 Updating existing products...\n');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN' : '🔴 LIVE'}\n`);

  // Load products
  console.log('📖 Loading products:', PRODUCTS_PATH);
  const productsContent = readFileSync(PRODUCTS_PATH, 'utf-8');
  const allProducts = JSON.parse(productsContent) as Product[];
  const productMap = new Map(allProducts.map(p => [p.code, p]));
  console.log(`✓ Loaded ${allProducts.length} products\n`);

  // Load product mappings
  console.log('📖 Loading product mappings:', PRODUCT_MAPPING_PATH);
  const mappingsContent = readFileSync(PRODUCT_MAPPING_PATH, 'utf-8');
  const mappings = JSON.parse(mappingsContent) as ProductMapping[];
  console.log(`✓ Loaded ${mappings.length} product mappings\n`);

  // Load category mappings
  console.log('📖 Loading category mappings:', CATEGORY_MAPPING_PATH);
  const categoryMappingsContent = readFileSync(CATEGORY_MAPPING_PATH, 'utf-8');
  const categoryMappingsArray = JSON.parse(categoryMappingsContent) as CategoryMapping[];
  const categoryMappings = new Map<string, string>();
  for (const mapping of categoryMappingsArray) {
    categoryMappings.set(mapping.volusionId, mapping.shopifyGid);
  }
  console.log(`✓ Loaded ${categoryMappings.size} category mappings\n`);

  // Update products
  let successCount = 0;
  let errorCount = 0;

  console.log('🔄 Updating products...\n');
  console.log('='.repeat(60) + '\n');

  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    const product = productMap.get(mapping.volusionCode);

    if (!product) {
      console.log(`[${i + 1}/${mappings.length}] ⚠️  Product ${mapping.volusionCode} not found in products.json`);
      errorCount++;
      continue;
    }

    console.log(`[${i + 1}/${mappings.length}] Updating "${product.title}"`);
    console.log(`   Code: ${product.code} | Shopify ID: ${mapping.shopify_product_id}`);

    const success = await updateProduct(
      mapping.shopifyGid,
      mapping.variantId,
      product,
      categoryMappings
    );

    if (success) {
      successCount++;
      console.log(`   ✓ Complete\n`);
    } else {
      errorCount++;
      console.log(`   ✗ Failed\n`);
    }

    // Rate limiting
    if (!DRY_RUN) {
      await sleep(RATE_LIMIT_DELAY);
    }
  }

  // Summary
  console.log('='.repeat(60));
  console.log('✨ Update Complete!\n');
  console.log(`Total products: ${mappings.length}`);
  console.log(`✓ Successful: ${successCount}`);
  console.log(`✗ Failed: ${errorCount}`);
  console.log('='.repeat(60));
}

// Run update
updateExistingProducts().catch(error => {
  console.error('\n❌ Update failed:', error);
  process.exit(1);
});
