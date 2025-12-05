import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration
const PRODUCT_LINKS_PATH = './migration/data/product-links.json';
const PRODUCT_MAPPING_PATH = './migration/data/product-mapping.json';
const OUTPUT_PATH = './migration/data/link-updates.json';
const SHOPIFY_STORE = process.env.SHOPIFY_STORE!;
const SHOPIFY_CLI_TOKEN = process.env.SHOPIFY_CLI_TOKEN!;
const API_VERSION = '2024-10';
const DRY_RUN = process.env.DRY_RUN === 'true';

// Types
interface ProductLinkReference {
  product_code: string;
  pattern: string;
  found_in: Array<{
    type: 'category' | 'product';
    id: string;
    name: string;
    field: string;
  }>;
}

interface ProductMapping {
  product_code: string;
  shopify_handle: string;
  shopify_id?: string;
}

interface LinkUpdate {
  type: 'product' | 'collection';
  id: string;
  name: string;
  old_content: string;
  new_content: string;
  changes_made: number;
}

// GraphQL queries
const GET_PRODUCT_BY_HANDLE = `
  query getProduct($handle: String!) {
    product(handle: $handle) {
      id
      title
      descriptionHtml
    }
  }
`;

const UPDATE_PRODUCT = `
  mutation productUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        descriptionHtml
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const GET_COLLECTION_BY_HANDLE = `
  query getCollection($handle: String!) {
    collection(handle: $handle) {
      id
      title
      descriptionHtml
    }
  }
`;

const UPDATE_COLLECTION = `
  mutation collectionUpdate($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      collection {
        id
        descriptionHtml
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Utility functions
async function shopifyGraphQL(query: string, variables: any = {}): Promise<any> {
  const url = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_CLI_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await response.json() as any;
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json;
}

function replaceProductLinks(
  text: string,
  productMappings: Map<string, string>
): { newText: string; changes: number } {
  if (!text) return { newText: text, changes: 0 };

  let newText = text;
  let changes = 0;

  // Pattern 1: ProductDetails.asp?ProductCode=XXX
  newText = newText.replace(
    /https?:\/\/(?:www\.)?factor2\.com\/ProductDetails\.asp\?ProductCode=([A-Za-z0-9_-]+)/gi,
    (match, code) => {
      const handle = productMappings.get(code.toUpperCase());
      if (handle) {
        changes++;
        return `/products/${handle}`;
      }
      console.log(`    ⚠️  Warning: No mapping found for product ${code}`);
      return match;
    }
  );

  // Pattern 2: Relative ProductDetails.asp?ProductCode=XXX
  newText = newText.replace(
    /(?<!https?:\/\/[^\s"'<>]*)ProductDetails\.asp\?ProductCode=([A-Za-z0-9_-]+)/gi,
    (match, code) => {
      const handle = productMappings.get(code.toUpperCase());
      if (handle) {
        changes++;
        return `/products/${handle}`;
      }
      console.log(`    ⚠️  Warning: No mapping found for product ${code}`);
      return match;
    }
  );

  // Pattern 3: /product_p/XXX.htm
  newText = newText.replace(
    /\/product_p\/([A-Za-z0-9_-]+)\.htm/gi,
    (match, code) => {
      const handle = productMappings.get(code.toUpperCase());
      if (handle) {
        changes++;
        return `/products/${handle}`;
      }
      console.log(`    ⚠️  Warning: No mapping found for product ${code}`);
      return match;
    }
  );

  // Pattern 4: /product_p/XXX (without .htm)
  newText = newText.replace(
    /\/product_p\/([A-Za-z0-9_-]+)(?![.\w])/gi,
    (match, code) => {
      const handle = productMappings.get(code.toUpperCase());
      if (handle) {
        changes++;
        return `/products/${handle}`;
      }
      console.log(`    ⚠️  Warning: No mapping found for product ${code}`);
      return match;
    }
  );

  return { newText, changes };
}

// Main update function
async function updateProductLinks() {
  console.log('🔗 Updating product links in Shopify...\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No updates will be made\n');
  }

  // Step 1: Load product links
  console.log('📖 Reading product links:', PRODUCT_LINKS_PATH);
  const linksContent = readFileSync(PRODUCT_LINKS_PATH, 'utf-8');
  const productLinks = JSON.parse(linksContent) as ProductLinkReference[];
  console.log(`✓ Found ${productLinks.length} unique product references\n`);

  // Step 2: Load product mapping
  console.log('📖 Reading product mapping:', PRODUCT_MAPPING_PATH);
  const mappingContent = readFileSync(PRODUCT_MAPPING_PATH, 'utf-8');
  const mappings = JSON.parse(mappingContent) as ProductMapping[];

  const mappingMap = new Map<string, string>();
  for (const mapping of mappings) {
    mappingMap.set(mapping.product_code.toUpperCase(), mapping.shopify_handle);
  }
  console.log(`✓ Loaded ${mappingMap.size} product mappings\n`);

  // Step 3: Group updates by entity
  const updates = new Map<string, { type: 'product' | 'collection'; handle: string; name: string }>();

  for (const link of productLinks) {
    for (const ref of link.found_in) {
      const key = `${ref.type}:${ref.id}`;
      if (!updates.has(key)) {
        updates.set(key, {
          type: ref.type === 'product' ? 'product' : 'collection',
          handle: ref.id.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          name: ref.name,
        });
      }
    }
  }

  console.log(`✓ Found ${updates.size} entities to update\n`);

  // Step 4: Process updates
  const linkUpdates: LinkUpdate[] = [];
  const errors: Array<{ id: string; error: string }> = [];
  let updated = 0;
  let skipped = 0;

  for (const [key, update] of updates) {
    const [type, id] = key.split(':');
    console.log(`\n[${updated + skipped + 1}/${updates.size}] Updating ${type}: ${update.name}`);

    try {
      if (type === 'product') {
        // Fetch product
        const productData = await shopifyGraphQL(GET_PRODUCT_BY_HANDLE, {
          handle: update.handle,
        });

        const product = productData.data.product;
        if (!product) {
          throw new Error(`Product not found with handle: ${update.handle}`);
        }

        const oldContent = product.descriptionHtml || '';
        const { newText: newContent, changes } = replaceProductLinks(oldContent, mappingMap);

        if (changes === 0) {
          console.log(`  ⏭️  No product links found, skipping...`);
          skipped++;
          continue;
        }

        console.log(`  🔄 Replacing ${changes} product link(s)...`);

        if (!DRY_RUN) {
          await shopifyGraphQL(UPDATE_PRODUCT, {
            input: {
              id: product.id,
              descriptionHtml: newContent,
            },
          });
        }

        linkUpdates.push({
          type: 'product',
          id,
          name: update.name,
          old_content: oldContent,
          new_content: newContent,
          changes_made: changes,
        });

        updated++;

      } else {
        // Fetch collection
        const collectionData = await shopifyGraphQL(GET_COLLECTION_BY_HANDLE, {
          handle: update.handle,
        });

        const collection = collectionData.data.collection;
        if (!collection) {
          throw new Error(`Collection not found with handle: ${update.handle}`);
        }

        const oldContent = collection.descriptionHtml || '';
        const { newText: newContent, changes } = replaceProductLinks(oldContent, mappingMap);

        if (changes === 0) {
          console.log(`  ⏭️  No product links found, skipping...`);
          skipped++;
          continue;
        }

        console.log(`  🔄 Replacing ${changes} product link(s)...`);

        if (!DRY_RUN) {
          await shopifyGraphQL(UPDATE_COLLECTION, {
            input: {
              id: collection.id,
              descriptionHtml: newContent,
            },
          });
        }

        linkUpdates.push({
          type: 'collection',
          id,
          name: update.name,
          old_content: oldContent,
          new_content: newContent,
          changes_made: changes,
        });

        updated++;
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}`);
      errors.push({
        id: key,
        error: error.message,
      });
    }
  }

  // Step 5: Save update log
  mkdirSync('./migration/data', { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(linkUpdates, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log(`\n✨ Product link update complete!\n`);
  console.log(`Total entities: ${updates.size}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (no links): ${skipped}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`\nTotal link replacements: ${linkUpdates.reduce((sum, u) => sum + u.changes_made, 0)}`);
  console.log(`\nOutput file: ${OUTPUT_PATH}`);

  if (errors.length > 0) {
    console.log(`\n⚠️  Errors:`);
    errors.forEach(err => {
      console.log(`   - ${err.id}: ${err.error}`);
    });
  }

  console.log('\n' + '='.repeat(60));
}

// Run update
updateProductLinks().catch(error => {
  console.error('\n❌ Product link update failed:', error);
  process.exit(1);
});
