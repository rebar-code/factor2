import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { parse } from 'csv-parse/sync';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration
const CSV_PATH = './old_site/export/Products_Joined_JG8NG9JREE.csv';
const PRODUCT_COLLECTIONS_PATH = './migration/data/product-collections.json';
const OUTPUT_PATH = './migration/data/products.json';

// Types
interface VolusionProduct {
  productcode: string;
  productname: string;
  productdescription: string;
  productdescriptionshort: string;
  productprice: string;
  listprice: string;
  productweight: string;
  stockstatus: string;
  photourl: string;
  photo_alttext: string;
  metatag_title: string;
  metatag_description: string;
  categoryids: string;
  optionids: string;
  hideproduct: string;
  vendor_partno: string;
  upc_code: string;
  productmanufacturer: string;
  productfeatures: string;
  techspecs: string;
  extinfo: string;
  metatag_keywords: string;
  [key: string]: string;
}

interface ProductCollections {
  product_id: string;
  category_ids: string[];
}

interface CleanProduct {
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
  };
}

// Utility functions
function decodeHtmlEntities(text: string): string {
  if (!text) return '';

  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function normalizeWhitespace(text: string): string {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

function stripHtmlTags(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

function sanitizeHandle(productCode: string): string {
  if (!productCode) return '';

  return productCode
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  const cleaned = priceStr.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

function parseWeight(weightStr: string): number {
  if (!weightStr) return 0;
  const parsed = parseFloat(weightStr);
  return isNaN(parsed) ? 0 : parsed;
}

function parseInventory(stockStr: string): number {
  if (!stockStr) return 0;
  const parsed = parseInt(stockStr, 10);
  return isNaN(parsed) ? 0 : parsed;
}

function parseCommaSeparatedIds(idsStr: string): string[] {
  if (!idsStr || !idsStr.trim()) return [];
  return idsStr.split(',').map(id => id.trim()).filter(id => id);
}

// Main conversion function
async function convertProducts() {
  console.log('🔄 Converting products CSV to JSON...\n');

  // Step 1: Parse CSV
  console.log('📖 Reading CSV file:', CSV_PATH);
  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as VolusionProduct[];

  console.log(`✓ Parsed ${records.length} products from CSV\n`);

  // Step 2: Load product-collections mapping if available
  let productCollectionsMap = new Map<string, string[]>();
  try {
    const productCollectionsContent = readFileSync(PRODUCT_COLLECTIONS_PATH, 'utf-8');
    const productCollections = JSON.parse(productCollectionsContent) as ProductCollections[];
    productCollectionsMap = new Map(
      productCollections.map(pc => [pc.product_id, pc.category_ids])
    );
    console.log(`✓ Loaded product-collections mapping: ${productCollectionsMap.size} products\n`);
  } catch (error) {
    console.log(`⚠️  Product-collections mapping not found. Run convert-product-collections first.`);
    console.log(`   Will use categoryids from product CSV as fallback.\n`);
  }

  // Step 3: Filter visible products
  const visibleProducts = records.filter(prod => prod.hideproduct !== 'Y');
  console.log(`✓ Filtered to ${visibleProducts.length} visible products\n`);

  // Step 4: Convert to clean format
  const cleanProducts: CleanProduct[] = [];
  const issues: string[] = [];

  console.log('🧹 Cleaning and validating data...\n');

  for (const prod of visibleProducts) {
    const handle = sanitizeHandle(prod.productcode);
    const price = parsePrice(prod.productprice);
    const compareAtPrice = parsePrice(prod.listprice);
    const weight = parseWeight(prod.productweight);
    const inventory = parseInventory(prod.stockstatus);

    // Get category IDs from product-collections mapping (preferred) or fall back to CSV
    let categoryIds = productCollectionsMap.get(prod.productcode) || [];
    if (categoryIds.length === 0) {
      categoryIds = parseCommaSeparatedIds(prod.categoryids);
    }

    // Clean descriptions
    const description = decodeHtmlEntities(prod.productdescription || '');
    const descriptionShort = decodeHtmlEntities(prod.productdescriptionshort || '');
    const seoDescription = decodeHtmlEntities(
      prod.metatag_description || stripHtmlTags(description).substring(0, 320) || prod.productname
    );
    const seoTitle = decodeHtmlEntities(prod.metatag_title || prod.productname);

    // Validate required fields
    if (!prod.productcode) {
      issues.push(`Product has no product code: ${prod.productname}`);
      continue;
    }
    if (!prod.productname) {
      issues.push(`Product ${prod.productcode} has no name`);
    }
    if (price <= 0) {
      issues.push(`Product ${prod.productcode} has invalid price: ${prod.productprice}`);
    }

    cleanProducts.push({
      code: prod.productcode,
      title: normalizeWhitespace(decodeHtmlEntities(prod.productname)),
      description,
      description_short: descriptionShort,
      seo_description: normalizeWhitespace(seoDescription),
      seo_title: normalizeWhitespace(seoTitle),
      handle,
      price,
      compare_at_price: compareAtPrice > 0 && compareAtPrice > price ? compareAtPrice : null,
      weight,
      inventory,
      image_url: prod.photourl || '',
      image_alt: normalizeWhitespace(decodeHtmlEntities(prod.photo_alttext || '')),
      category_ids: categoryIds,
      option_ids: parseCommaSeparatedIds(prod.optionids),
      vendor: normalizeWhitespace(decodeHtmlEntities(prod.vendor_partno || '')),
      barcode: prod.upc_code || '',
      manufacturer: normalizeWhitespace(decodeHtmlEntities(prod.productmanufacturer || '')),
      original_data: {
        features: decodeHtmlEntities(prod.productfeatures || ''),
        tech_specs: decodeHtmlEntities(prod.techspecs || ''),
        extended_info: decodeHtmlEntities(prod.extinfo || ''),
        keywords: decodeHtmlEntities(prod.metatag_keywords || ''),
      },
    });
  }

  console.log(`✓ Converted ${cleanProducts.length} products\n`);

  // Step 5: Validate data
  console.log('✅ Validating...\n');

  const handleCounts = new Map<string, number>();
  const codeCounts = new Map<string, number>();

  for (const prod of cleanProducts) {
    handleCounts.set(prod.handle, (handleCounts.get(prod.handle) || 0) + 1);
    codeCounts.set(prod.code, (codeCounts.get(prod.code) || 0) + 1);
  }

  // Report duplicate handles
  const duplicateHandles = Array.from(handleCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([handle]) => handle);

  if (duplicateHandles.length > 0) {
    console.log('⚠️  Warning: Duplicate handles found:');
    duplicateHandles.forEach(handle => {
      const prods = cleanProducts.filter(p => p.handle === handle);
      console.log(`   - "${handle}": ${prods.map(p => `${p.title} (${p.code})`).join(', ')}`);
    });
    console.log();
  }

  // Report duplicate product codes
  const duplicateCodes = Array.from(codeCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([code]) => code);

  if (duplicateCodes.length > 0) {
    console.log('⚠️  Warning: Duplicate product codes found:');
    duplicateCodes.forEach(code => {
      const prods = cleanProducts.filter(p => p.code === code);
      console.log(`   - "${code}": ${prods.map(p => p.title).join(', ')}`);
    });
    console.log();
  }

  if (issues.length > 0) {
    console.log('⚠️  Validation issues found:');
    issues.slice(0, 20).forEach(issue => console.log(`   - ${issue}`));
    if (issues.length > 20) {
      console.log(`   ... and ${issues.length - 20} more`);
    }
    console.log();
  }

  // Step 6: Generate statistics
  const stats = {
    total_products: cleanProducts.length,
    with_images: cleanProducts.filter(p => p.image_url).length,
    with_alt_text: cleanProducts.filter(p => p.image_alt).length,
    with_categories: cleanProducts.filter(p => p.category_ids.length > 0).length,
    with_options: cleanProducts.filter(p => p.option_ids.length > 0).length,
    avg_price: cleanProducts.reduce((sum, p) => sum + p.price, 0) / cleanProducts.length,
    avg_categories_per_product: cleanProducts.reduce((sum, p) => sum + p.category_ids.length, 0) / cleanProducts.length,
  };

  // Step 7: Save to JSON
  mkdirSync('./migration/data', { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(cleanProducts, null, 2));

  console.log('='.repeat(60));
  console.log(`\n✨ Conversion complete!\n`);
  console.log(`Total products: ${stats.total_products}`);
  console.log(`With images: ${stats.with_images}`);
  console.log(`With alt text: ${stats.with_alt_text}`);
  console.log(`With categories: ${stats.with_categories}`);
  console.log(`With options (variants): ${stats.with_options}`);
  console.log(`Average price: $${stats.avg_price.toFixed(2)}`);
  console.log(`Avg categories per product: ${stats.avg_categories_per_product.toFixed(1)}`);
  console.log(`\nDuplicate handles: ${duplicateHandles.length}`);
  console.log(`Duplicate codes: ${duplicateCodes.length}`);
  console.log(`Validation issues: ${issues.length}`);
  console.log(`\nOutput file: ${OUTPUT_PATH}`);
  console.log('\n' + '='.repeat(60));
}

// Run conversion
convertProducts().catch(error => {
  console.error('\n❌ Conversion failed:', error);
  process.exit(1);
});
