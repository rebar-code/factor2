import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration
const CATEGORIES_PATH = './migration/data/categories.json';
const PRODUCTS_PATH = './migration/data/products.json';
const OUTPUT_PATH = './migration/data/product-links.json';

// Types
interface Category {
  id: string;
  name: string;
  description: string;
  original_data: {
    description_short: string;
  };
}

interface Product {
  code: string;
  title: string;
  description: string;
  description_short: string;
  original_data: {
    features: string;
    tech_specs: string;
    extended_info: string;
  };
}

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

// Utility functions
function extractProductLinks(text: string): Array<{ code: string; pattern: string }> {
  if (!text) return [];

  const links: Array<{ code: string; pattern: string }> = [];

  // Pattern 1: ProductDetails.asp?ProductCode=XXX
  const pattern1 = /ProductDetails\.asp\?ProductCode=([A-Za-z0-9_-]+)/gi;
  let match;
  while ((match = pattern1.exec(text)) !== null) {
    links.push({
      code: match[1],
      pattern: match[0],
    });
  }

  // Pattern 2: /product_p/XXX.htm
  const pattern2 = /\/product_p\/([A-Za-z0-9_-]+)\.htm/gi;
  while ((match = pattern2.exec(text)) !== null) {
    links.push({
      code: match[1],
      pattern: match[0],
    });
  }

  // Pattern 3: /product_p/XXX (without .htm)
  const pattern3 = /\/product_p\/([A-Za-z0-9_-]+)(?![.\w])/gi;
  while ((match = pattern3.exec(text)) !== null) {
    links.push({
      code: match[1],
      pattern: match[0],
    });
  }

  // Pattern 4: Direct domain links
  const pattern4 = /https?:\/\/(?:www\.)?factor2\.com\/ProductDetails\.asp\?ProductCode=([A-Za-z0-9_-]+)/gi;
  while ((match = pattern4.exec(text)) !== null) {
    links.push({
      code: match[1],
      pattern: match[0],
    });
  }

  return links;
}

// Main extraction function
async function extractProductLinkReferences() {
  console.log('🔍 Extracting product link references from content...\n');

  const linkMap = new Map<string, ProductLinkReference>();

  // Step 1: Load categories
  console.log('📖 Reading categories JSON:', CATEGORIES_PATH);
  const categoriesContent = readFileSync(CATEGORIES_PATH, 'utf-8');
  const categories = JSON.parse(categoriesContent) as Category[];
  console.log(`✓ Loaded ${categories.length} categories\n`);

  // Step 2: Load products
  console.log('📖 Reading products JSON:', PRODUCTS_PATH);
  const productsContent = readFileSync(PRODUCTS_PATH, 'utf-8');
  const products = JSON.parse(productsContent) as Product[];
  console.log(`✓ Loaded ${products.length} products\n`);

  // Step 3: Extract from categories
  console.log('🔎 Scanning categories for product links...\n');

  for (const category of categories) {
    const fields = {
      description: category.description,
      description_short: category.original_data.description_short,
    };

    for (const [fieldName, text] of Object.entries(fields)) {
      const links = extractProductLinks(text);

      for (const link of links) {
        const key = link.code.toUpperCase();

        if (!linkMap.has(key)) {
          linkMap.set(key, {
            product_code: link.code,
            pattern: link.pattern,
            found_in: [],
          });
        }

        linkMap.get(key)!.found_in.push({
          type: 'category',
          id: category.id,
          name: category.name,
          field: fieldName,
        });
      }
    }
  }

  console.log(`✓ Found product links in categories\n`);

  // Step 4: Extract from products
  console.log('🔎 Scanning products for product links...\n');

  for (const product of products) {
    const fields = {
      description: product.description,
      description_short: product.description_short,
      features: product.original_data.features,
      tech_specs: product.original_data.tech_specs,
      extended_info: product.original_data.extended_info,
    };

    for (const [fieldName, text] of Object.entries(fields)) {
      const links = extractProductLinks(text);

      for (const link of links) {
        const key = link.code.toUpperCase();

        if (!linkMap.has(key)) {
          linkMap.set(key, {
            product_code: link.code,
            pattern: link.pattern,
            found_in: [],
          });
        }

        linkMap.get(key)!.found_in.push({
          type: 'product',
          id: product.code,
          name: product.title,
          field: fieldName,
        });
      }
    }
  }

  console.log(`✓ Found product links in products\n`);

  // Step 5: Convert to array and generate statistics
  const links = Array.from(linkMap.values());

  const stats = {
    total_unique_products_referenced: links.length,
    total_references: links.reduce((sum, link) => sum + link.found_in.length, 0),
    by_location: {
      in_categories: links.filter(l => l.found_in.some(ref => ref.type === 'category')).length,
      in_products: links.filter(l => l.found_in.some(ref => ref.type === 'product')).length,
    },
  };

  // Step 6: Save to JSON
  mkdirSync('./migration/data', { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(links, null, 2));

  console.log('='.repeat(60));
  console.log(`\n✨ Product link extraction complete!\n`);
  console.log(`Unique products referenced: ${stats.total_unique_products_referenced}`);
  console.log(`Total references: ${stats.total_references}`);
  console.log(`\nBy location:`);
  console.log(`  - In categories: ${stats.by_location.in_categories}`);
  console.log(`  - In products: ${stats.by_location.in_products}`);
  console.log(`\nOutput file: ${OUTPUT_PATH}`);
  console.log('\n' + '='.repeat(60));
  console.log('\n💡 Next steps:');
  console.log('   1. Migrate all products first');
  console.log('   2. Run update-product-links.ts to fix all internal links\n');
}

// Run extraction
extractProductLinkReferences().catch(error => {
  console.error('\n❌ Product link extraction failed:', error);
  process.exit(1);
});
