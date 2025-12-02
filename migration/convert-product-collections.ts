import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { parse } from 'csv-parse/sync';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration
const CSV_PATH = './old_site/export/Categories_Products_Link_TRHWQJTZPP.csv';
const OUTPUT_PATH = './migration/data/product-collections.json';

// Types
interface ProductCategoryLink {
  id: string; // product ID
  categoryid: string;
  auto_maintenance_column: string;
  [key: string]: string;
}

interface ProductCollections {
  product_id: string;
  category_ids: string[];
}

// Main conversion function
async function convertProductCollections() {
  console.log('🔄 Converting product-category links CSV to JSON...\n');

  // Step 1: Parse CSV
  console.log('📖 Reading CSV file:', CSV_PATH);
  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as ProductCategoryLink[];

  console.log(`✓ Parsed ${records.length} product-category links from CSV\n`);

  // Step 2: Group by product ID
  const productMap = new Map<string, Set<string>>();

  for (const record of records) {
    const productId = record.id;
    const categoryId = record.categoryid;

    if (!productId || !categoryId) {
      console.log(`⚠️  Skipping invalid record: product_id=${productId}, category_id=${categoryId}`);
      continue;
    }

    if (!productMap.has(productId)) {
      productMap.set(productId, new Set());
    }

    productMap.get(productId)!.add(categoryId);
  }

  console.log(`✓ Found ${productMap.size} unique products with category assignments\n`);

  // Step 3: Convert to clean format
  const productCollections: ProductCollections[] = [];

  for (const [productId, categoryIds] of productMap.entries()) {
    productCollections.push({
      product_id: productId,
      category_ids: Array.from(categoryIds).sort(),
    });
  }

  // Sort by product ID for easier lookup
  productCollections.sort((a, b) => a.product_id.localeCompare(b.product_id));

  // Step 4: Generate statistics
  const categoryCounts = new Map<string, number>();
  for (const pc of productCollections) {
    for (const catId of pc.category_ids) {
      categoryCounts.set(catId, (categoryCounts.get(catId) || 0) + 1);
    }
  }

  const productsPerCategoryStats = {
    total_categories: categoryCounts.size,
    avg_products_per_category: Array.from(categoryCounts.values()).reduce((a, b) => a + b, 0) / categoryCounts.size,
    max_products_in_category: Math.max(...Array.from(categoryCounts.values())),
    min_products_in_category: Math.min(...Array.from(categoryCounts.values())),
  };

  const categoriesPerProductStats = {
    avg_categories_per_product: productCollections.reduce((sum, p) => sum + p.category_ids.length, 0) / productCollections.length,
    max_categories_for_product: Math.max(...productCollections.map(p => p.category_ids.length)),
    min_categories_for_product: Math.min(...productCollections.map(p => p.category_ids.length)),
  };

  // Step 5: Save to JSON
  mkdirSync('./migration/data', { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(productCollections, null, 2));

  console.log('='.repeat(60));
  console.log(`\n✨ Conversion complete!\n`);
  console.log(`Total product-category links: ${records.length}`);
  console.log(`Unique products: ${productCollections.length}`);
  console.log(`Categories referenced: ${categoryCounts.size}`);
  console.log(`\nProducts per category:`);
  console.log(`  - Average: ${productsPerCategoryStats.avg_products_per_category.toFixed(1)}`);
  console.log(`  - Max: ${productsPerCategoryStats.max_products_in_category}`);
  console.log(`  - Min: ${productsPerCategoryStats.min_products_in_category}`);
  console.log(`\nCategories per product:`);
  console.log(`  - Average: ${categoriesPerProductStats.avg_categories_per_product.toFixed(1)}`);
  console.log(`  - Max: ${categoriesPerProductStats.max_categories_for_product}`);
  console.log(`  - Min: ${categoriesPerProductStats.min_categories_for_product}`);
  console.log(`\nOutput file: ${OUTPUT_PATH}`);
  console.log('\n' + '='.repeat(60));
}

// Run conversion
convertProductCollections().catch(error => {
  console.error('\n❌ Conversion failed:', error);
  process.exit(1);
});
