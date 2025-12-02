import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration
const CATEGORIES_PATH = './migration/data/categories.json';
const PRODUCTS_PATH = './migration/data/products.json';
const OUTPUT_PATH = './migration/data/redirects.json';

// Types
interface Category {
  id: string;
  name: string;
  handle: string;
  original_data: {
    alternateurl: string;
  };
}

interface Product {
  code: string;
  handle: string;
}

interface Redirect {
  from: string;
  to: string;
  type: 'product' | 'collection';
  id: string;
}

// Main conversion function
async function convertRedirects() {
  console.log('🔄 Generating URL redirects...\n');

  const redirects: Redirect[] = [];

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

  // Step 3: Generate category redirects
  console.log('🔗 Generating category redirects...\n');

  for (const category of categories) {
    const categoryId = category.id;
    const handle = category.handle;
    const alternateUrl = category.original_data.alternateurl;

    // Common Volusion category URL patterns:
    // 1. /category_s/{id}.htm
    // 2. /{name}_s/{id}.htm (using alternateurl as name)
    // 3. /SearchResults.asp?Cat={id}

    // Pattern 1: /category_s/{id}.htm
    redirects.push({
      from: `/category_s/${categoryId}.htm`,
      to: `/collections/${handle}`,
      type: 'collection',
      id: categoryId,
    });

    // Pattern 2: /{alternateurl}_s/{id}.htm
    if (alternateUrl && alternateUrl.trim()) {
      const altUrlClean = alternateUrl.trim().toLowerCase();
      redirects.push({
        from: `/${altUrlClean}_s/${categoryId}.htm`,
        to: `/collections/${handle}`,
        type: 'collection',
        id: categoryId,
      });

      // Also add variant without .htm
      redirects.push({
        from: `/${altUrlClean}_s/${categoryId}`,
        to: `/collections/${handle}`,
        type: 'collection',
        id: categoryId,
      });
    }

    // Pattern 3: /SearchResults.asp?Cat={id}
    redirects.push({
      from: `/SearchResults.asp?Cat=${categoryId}`,
      to: `/collections/${handle}`,
      type: 'collection',
      id: categoryId,
    });
  }

  console.log(`✓ Generated ${redirects.filter(r => r.type === 'collection').length} category redirects\n`);

  // Step 4: Generate product redirects
  console.log('🔗 Generating product redirects...\n');

  for (const product of products) {
    const productCode = product.code;
    const handle = product.handle;

    // Common Volusion product URL patterns:
    // 1. /ProductDetails.asp?ProductCode={code}
    // 2. /product_p/{code}.htm

    // Pattern 1: /ProductDetails.asp?ProductCode={code}
    redirects.push({
      from: `/ProductDetails.asp?ProductCode=${productCode}`,
      to: `/products/${handle}`,
      type: 'product',
      id: productCode,
    });

    // Pattern 2: /product_p/{code}.htm
    redirects.push({
      from: `/product_p/${productCode}.htm`,
      to: `/products/${handle}`,
      type: 'product',
      id: productCode,
    });

    // Pattern 3: /product_p/{code} (without .htm)
    redirects.push({
      from: `/product_p/${productCode}`,
      to: `/products/${handle}`,
      type: 'product',
      id: productCode,
    });
  }

  console.log(`✓ Generated ${redirects.filter(r => r.type === 'product').length} product redirects\n`);

  // Step 5: Remove duplicates
  const uniqueRedirects = Array.from(
    new Map(redirects.map(r => [`${r.from}::${r.to}`, r])).values()
  );

  console.log(`✓ Removed duplicates: ${redirects.length} -> ${uniqueRedirects.length} redirects\n`);

  // Step 6: Save to JSON
  mkdirSync('./migration/data', { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(uniqueRedirects, null, 2));

  console.log('='.repeat(60));
  console.log(`\n✨ Redirect generation complete!\n`);
  console.log(`Total redirects: ${uniqueRedirects.length}`);
  console.log(`  - Collection redirects: ${uniqueRedirects.filter(r => r.type === 'collection').length}`);
  console.log(`  - Product redirects: ${uniqueRedirects.filter(r => r.type === 'product').length}`);
  console.log(`\nOutput file: ${OUTPUT_PATH}`);
  console.log('\n' + '='.repeat(60));
  console.log('\n💡 Next steps:');
  console.log('   1. Review the redirects in the output file');
  console.log('   2. Use Shopify Bulk Redirects API to import them');
  console.log('   3. Or use a Shopify app like "Easy Redirects" to import the CSV version\n');
}

// Run conversion
convertRedirects().catch(error => {
  console.error('\n❌ Redirect generation failed:', error);
  process.exit(1);
});
