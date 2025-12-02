import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { parse } from 'csv-parse/sync';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config();

// Configuration
const CSV_PATH = './old_site/export/Categories_MJBQJCMTGG.csv';
const OUTPUT_PATH = './migration/data/categories.json';

// Types
interface VolusionCategory {
  categoryid: string;
  parentid: string;
  categoryname: string;
  categoryorder: string;
  categoryvisible: string;
  alternateurl: string;
  categorydescription: string;
  categorydescriptionshort: string;
  metatag_title: string;
  metatag_description: string;
  metatag_keywords: string;
  breadcrumb: string;
  [key: string]: string;
}

interface CleanCategory {
  id: string;
  name: string;
  parent_id: string;
  description: string;
  seo_description: string;
  seo_title: string;
  handle: string;
  sort_order: number;
  hierarchy_path: string;
  visible: boolean;
  original_data: {
    alternateurl: string;
    description_short: string;
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

function sanitizeHandle(name: string, altUrl: string, categoryId: string): string {
  // Prefer alternateurl if available
  if (altUrl && altUrl.trim()) {
    return altUrl.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  // Otherwise generate from category name
  let handle = name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // If handle is empty, use category ID
  if (!handle) {
    handle = `category-${categoryId}`;
  }

  return handle;
}

function buildHierarchyPath(
  category: VolusionCategory,
  categoryMap: Map<string, VolusionCategory>
): string {
  // Use breadcrumb if available
  if (category.breadcrumb && category.breadcrumb.trim()) {
    return decodeHtmlEntities(category.breadcrumb.trim());
  }

  // Build from hierarchy
  const path: string[] = [];
  let current: VolusionCategory | undefined = category;

  while (current) {
    path.unshift(current.categoryname);
    if (current.parentid === '0') break;
    current = categoryMap.get(current.parentid);
  }

  return path.join(' > ');
}

function stripHtmlTags(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

// Main conversion function
async function convertCategories() {
  console.log('🔄 Converting categories CSV to JSON...\n');

  // Step 1: Parse CSV
  console.log('📖 Reading CSV file:', CSV_PATH);
  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as VolusionCategory[];

  console.log(`✓ Parsed ${records.length} categories from CSV\n`);

  // Step 2: Filter visible categories
  const visibleCategories = records.filter(cat => cat.categoryvisible === '1');
  console.log(`✓ Filtered to ${visibleCategories.length} visible categories\n`);

  // Step 3: Build category map for hierarchy lookups
  const categoryMap = new Map<string, VolusionCategory>();
  visibleCategories.forEach(cat => categoryMap.set(cat.categoryid, cat));

  // Step 4: Convert to clean format
  const cleanCategories: CleanCategory[] = [];

  console.log('🧹 Cleaning and validating data...\n');

  for (const cat of visibleCategories) {
    const hierarchyPath = buildHierarchyPath(cat, categoryMap);
    const handle = sanitizeHandle(cat.categoryname, cat.alternateurl, cat.categoryid);

    // Clean descriptions
    const description = decodeHtmlEntities(cat.categorydescription || '');
    const seoDescription = decodeHtmlEntities(
      cat.metatag_description || stripHtmlTags(description) || cat.categoryname
    );
    const seoTitle = decodeHtmlEntities(cat.metatag_title || cat.categoryname);

    cleanCategories.push({
      id: cat.categoryid,
      name: normalizeWhitespace(decodeHtmlEntities(cat.categoryname)),
      parent_id: cat.parentid,
      description,
      seo_description: normalizeWhitespace(seoDescription),
      seo_title: normalizeWhitespace(seoTitle),
      handle,
      sort_order: parseInt(cat.categoryorder || '0', 10),
      hierarchy_path: hierarchyPath,
      visible: true,
      original_data: {
        alternateurl: cat.alternateurl,
        description_short: decodeHtmlEntities(cat.categorydescriptionshort || ''),
        keywords: decodeHtmlEntities(cat.metatag_keywords || ''),
      },
    });
  }

  // Step 5: Sort by dependency order (parents before children)
  const sortedCategories: CleanCategory[] = [];
  const processed = new Set<string>();

  function addCategoryAndParents(category: CleanCategory) {
    if (processed.has(category.id)) return;

    // First add parent if it exists
    if (category.parent_id !== '0') {
      const parent = cleanCategories.find(c => c.id === category.parent_id);
      if (parent) {
        addCategoryAndParents(parent);
      }
    }

    // Then add this category
    sortedCategories.push(category);
    processed.add(category.id);
  }

  cleanCategories.forEach(cat => addCategoryAndParents(cat));
  console.log(`✓ Sorted ${sortedCategories.length} categories by dependency order\n`);

  // Step 6: Validate data
  console.log('✅ Validating...\n');

  const handleCounts = new Map<string, number>();
  const issues: string[] = [];

  for (const cat of sortedCategories) {
    // Check for duplicate handles
    handleCounts.set(cat.handle, (handleCounts.get(cat.handle) || 0) + 1);

    // Validate required fields
    if (!cat.name) {
      issues.push(`Category ${cat.id} has no name`);
    }
    if (!cat.handle) {
      issues.push(`Category ${cat.id} has no handle`);
    }
  }

  // Report duplicate handles
  const duplicateHandles = Array.from(handleCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([handle]) => handle);

  if (duplicateHandles.length > 0) {
    console.log('⚠️  Warning: Duplicate handles found:');
    duplicateHandles.forEach(handle => {
      const cats = sortedCategories.filter(c => c.handle === handle);
      console.log(`   - "${handle}": ${cats.map(c => `${c.name} (ID: ${c.id})`).join(', ')}`);
    });
    console.log();
  }

  if (issues.length > 0) {
    console.log('⚠️  Validation issues found:');
    issues.forEach(issue => console.log(`   - ${issue}`));
    console.log();
  }

  // Step 7: Save to JSON
  mkdirSync('./migration/data', { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(sortedCategories, null, 2));

  console.log('='.repeat(60));
  console.log(`\n✨ Conversion complete!\n`);
  console.log(`Total categories: ${sortedCategories.length}`);
  console.log(`Output file: ${OUTPUT_PATH}`);
  console.log(`Duplicate handles: ${duplicateHandles.length}`);
  console.log(`Validation issues: ${issues.length}`);
  console.log('\n' + '='.repeat(60));
}

// Run conversion
convertCategories().catch(error => {
  console.error('\n❌ Conversion failed:', error);
  process.exit(1);
});
