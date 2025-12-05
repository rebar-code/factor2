import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration
const CATEGORIES_PATH = './migration/data/categories.json';
const PRODUCTS_PATH = './migration/data/products.json';
const OUTPUT_PATH = './migration/data/files-to-upload.json';

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

interface FileReference {
  url: string;
  type: 'pdf' | 'image' | 'document' | 'unknown';
  found_in: Array<{
    type: 'category' | 'product';
    id: string;
    name: string;
    field: string;
  }>;
}

// Utility functions
function extractUrls(text: string): string[] {
  if (!text) return [];

  const urls: string[] = [];

  // Pattern 1: URLs in quoted attributes (handles spaces in URLs)
  const quotedPattern = /(?:src|href)=["']([^"']+?\.(pdf|jpg|jpeg|png|gif|webp|svg|doc|docx|xls|xlsx|zip|txt)[^"']*)["']/gi;
  let match;
  while ((match = quotedPattern.exec(text)) !== null) {
    urls.push(match[1]);
  }

  // Pattern 2: Full URLs with domain (without quotes, no spaces)
  const fullUrlPattern = /https?:\/\/[^\s<>"']+?\.(pdf|jpg|jpeg|png|gif|webp|svg|doc|docx|xls|xlsx|zip|txt)/gi;
  const fullUrls = text.match(fullUrlPattern) || [];
  urls.push(...fullUrls);

  return urls;
}

function normalizeUrl(url: string, baseUrl: string = 'https://www.factor2.com'): string {
  // Remove query params and anchors for deduplication
  let normalized = url.split('?')[0].split('#')[0];

  // Make relative URLs absolute
  if (normalized.startsWith('/')) {
    normalized = baseUrl + normalized;
  }

  // URL encode spaces and special characters
  // Split by '/' to preserve path structure
  const urlObj = new URL(normalized);
  const pathParts = urlObj.pathname.split('/');
  const encodedParts = pathParts.map(part => {
    // Only encode if not already encoded (avoid double-encoding)
    if (part.includes('%')) {
      return part; // Already encoded
    }
    // Encode spaces and special characters but preserve ()&
    return part
      .replace(/ /g, '%20')
      .replace(/&/g, '%26');
  });
  urlObj.pathname = encodedParts.join('/');

  return urlObj.toString();
}

function getFileType(url: string): 'pdf' | 'image' | 'document' | 'unknown' {
  const ext = url.toLowerCase().split('.').pop() || '';

  if (ext === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['doc', 'docx', 'xls', 'xlsx', 'zip', 'txt'].includes(ext)) return 'document';

  return 'unknown';
}

// Main extraction function
async function extractFiles() {
  console.log('🔍 Extracting file references from content...\n');

  const fileMap = new Map<string, FileReference>();

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
  console.log('🔎 Scanning categories for file references...\n');

  for (const category of categories) {
    const fields = {
      description: category.description,
      description_short: category.original_data.description_short,
    };

    for (const [fieldName, text] of Object.entries(fields)) {
      const urls = extractUrls(text);

      for (const url of urls) {
        const normalized = normalizeUrl(url);
        const type = getFileType(normalized);

        if (!fileMap.has(normalized)) {
          fileMap.set(normalized, {
            url: normalized,
            type,
            found_in: [],
          });
        }

        fileMap.get(normalized)!.found_in.push({
          type: 'category',
          id: category.id,
          name: category.name,
          field: fieldName,
        });
      }
    }
  }

  console.log(`✓ Found file references in categories\n`);

  // Step 4: Extract from products
  console.log('🔎 Scanning products for file references...\n');

  for (const product of products) {
    const fields = {
      description: product.description,
      description_short: product.description_short,
      features: product.original_data.features,
      tech_specs: product.original_data.tech_specs,
      extended_info: product.original_data.extended_info,
    };

    for (const [fieldName, text] of Object.entries(fields)) {
      const urls = extractUrls(text);

      for (const url of urls) {
        const normalized = normalizeUrl(url);
        const type = getFileType(normalized);

        if (!fileMap.has(normalized)) {
          fileMap.set(normalized, {
            url: normalized,
            type,
            found_in: [],
          });
        }

        fileMap.get(normalized)!.found_in.push({
          type: 'product',
          id: product.code,
          name: product.title,
          field: fieldName,
        });
      }
    }
  }

  console.log(`✓ Found file references in products\n`);

  // Step 5: Convert to array and generate statistics
  const files = Array.from(fileMap.values());

  const stats = {
    total_files: files.length,
    by_type: {
      pdf: files.filter(f => f.type === 'pdf').length,
      image: files.filter(f => f.type === 'image').length,
      document: files.filter(f => f.type === 'document').length,
      unknown: files.filter(f => f.type === 'unknown').length,
    },
    by_location: {
      categories_only: files.filter(f => f.found_in.every(ref => ref.type === 'category')).length,
      products_only: files.filter(f => f.found_in.every(ref => ref.type === 'product')).length,
      both: files.filter(f =>
        f.found_in.some(ref => ref.type === 'category') &&
        f.found_in.some(ref => ref.type === 'product')
      ).length,
    },
  };

  // Step 6: Save to JSON
  mkdirSync('./migration/data', { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(files, null, 2));

  console.log('='.repeat(60));
  console.log(`\n✨ File extraction complete!\n`);
  console.log(`Total unique files: ${stats.total_files}`);
  console.log(`\nBy type:`);
  console.log(`  - PDFs: ${stats.by_type.pdf}`);
  console.log(`  - Images: ${stats.by_type.image}`);
  console.log(`  - Documents: ${stats.by_type.document}`);
  console.log(`  - Unknown: ${stats.by_type.unknown}`);
  console.log(`\nBy location:`);
  console.log(`  - Categories only: ${stats.by_location.categories_only}`);
  console.log(`  - Products only: ${stats.by_location.products_only}`);
  console.log(`  - Both: ${stats.by_location.both}`);
  console.log(`\nOutput file: ${OUTPUT_PATH}`);
  console.log('\n' + '='.repeat(60));
  console.log('\n💡 Next step:');
  console.log('   Run upload-files.ts to download and upload files to Shopify\n');
}

// Run extraction
extractFiles().catch(error => {
  console.error('\n❌ File extraction failed:', error);
  process.exit(1);
});
