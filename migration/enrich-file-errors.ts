import { readFileSync, writeFileSync } from 'fs';

// Configuration
const ERRORS_PATH = './migration/data/file-upload-errors.json';
const FILES_PATH = './migration/data/files-to-upload.json';
const PRODUCTS_PATH = './migration/data/products.json';
const OUTPUT_PATH = './migration/data/file-upload-errors-enriched.json';

// Types
interface FileReference {
  url: string;
  type: string;
  found_in: Array<{
    type: 'category' | 'product';
    id: string;
    name: string;
    field: string;
  }>;
}

interface Product {
  code: string;
  title: string;
  handle: string;
}

interface Error {
  url: string;
  error: string;
  type: string;
}

interface EnrichedError {
  url: string;
  error: string;
  type: string;
  found_in: Array<{
    type: 'category' | 'product';
    id: string;
    name: string;
    field: string;
    product_url?: string;
  }>;
}

console.log('🔗 Enriching error file with location information...\n');

// Step 1: Load errors
console.log('📖 Reading errors:', ERRORS_PATH);
const errorsContent = readFileSync(ERRORS_PATH, 'utf-8');
const errors = JSON.parse(errorsContent) as Error[];
console.log(`✓ Loaded ${errors.length} errors\n`);

// Step 2: Load files reference
console.log('📖 Reading files reference:', FILES_PATH);
const filesContent = readFileSync(FILES_PATH, 'utf-8');
const files = JSON.parse(filesContent) as FileReference[];

// Build URL -> found_in map
const fileMap = new Map<string, FileReference['found_in']>();
for (const file of files) {
  fileMap.set(file.url, file.found_in);
}
console.log(`✓ Loaded ${files.length} file references\n`);

// Step 3: Load products for URL lookups
console.log('📖 Reading products:', PRODUCTS_PATH);
const productsContent = readFileSync(PRODUCTS_PATH, 'utf-8');
const products = JSON.parse(productsContent) as Product[];

// Build product code -> product map
const productMap = new Map<string, Product>();
for (const product of products) {
  productMap.set(product.code, product);
}
console.log(`✓ Loaded ${products.length} products\n`);

// Step 4: Enrich errors with location info
console.log('✨ Enriching errors with locations...\n');
const enrichedErrors: EnrichedError[] = [];

for (const error of errors) {
  const foundIn = fileMap.get(error.url) || [];

  // Add product URLs if it's a product reference
  const enrichedFoundIn = foundIn.map(location => {
    const enriched: any = { ...location };
    if (location.type === 'product') {
      const product = productMap.get(location.id);
      if (product) {
        enriched.product_url = `https://www.factor2.com/ProductDetails.asp?ProductCode=${product.code}`;
      }
    }
    return enriched;
  });

  enrichedErrors.push({
    url: error.url,
    error: error.error,
    type: error.type,
    found_in: enrichedFoundIn,
  });
}

// Step 5: Save enriched errors
writeFileSync(OUTPUT_PATH, JSON.stringify(enrichedErrors, null, 2));

// Step 6: Generate summary
console.log('='.repeat(60));
console.log(`\n📋 Error Summary:\n`);

const errorsByType = {
  products: new Map<string, number>(),
  categories: new Map<string, number>(),
};

for (const error of enrichedErrors) {
  for (const location of error.found_in) {
    const key = `${location.type}: ${location.id} - ${location.name}`;
    if (location.type === 'product') {
      errorsByType.products.set(key, (errorsByType.products.get(key) || 0) + 1);
    } else {
      errorsByType.categories.set(key, (errorsByType.categories.get(key) || 0) + 1);
    }
  }
}

console.log('📦 Missing files in products:\n');
let productCount = 0;
for (const error of enrichedErrors) {
  for (const location of error.found_in) {
    if (location.type === 'product') {
      productCount++;
      console.log(`   ${productCount}. ${location.name} (${location.id})`);
      console.log(`      Field: ${location.field}`);
      console.log(`      Product URL: ${location.product_url || 'N/A'}`);
      console.log(`      Missing file: ${error.url}\n`);
    }
  }
}

if (productCount === 0) {
  console.log('   (None)\n');
}

console.log('\n📁 Missing files in categories:\n');
let categoryCount = 0;
for (const error of enrichedErrors) {
  for (const location of error.found_in) {
    if (location.type === 'category') {
      categoryCount++;
      console.log(`   ${categoryCount}. ${location.name} (${location.id})`);
      console.log(`      Field: ${location.field}`);
      console.log(`      Missing file: ${error.url}\n`);
    }
  }
}

if (categoryCount === 0) {
  console.log('   (None)\n');
}

console.log('\n' + '='.repeat(60));
console.log(`\n✅ Enriched errors saved to: ${OUTPUT_PATH}\n`);
console.log(`Total errors: ${enrichedErrors.length}`);
console.log(`Errors with locations: ${enrichedErrors.filter(e => e.found_in.length > 0).length}`);
console.log(`Products affected: ${errorsByType.products.size}`);
console.log(`Categories affected: ${errorsByType.categories.size}`);
console.log('\n' + '='.repeat(60));
console.log('\n💡 Next steps:');
console.log('   1. Review file-upload-errors-enriched.json');
console.log('   2. Check which products/categories need these files');
console.log('   3. Find or recreate the missing PDFs');
console.log('   4. Consider removing these file references if not found\n');
