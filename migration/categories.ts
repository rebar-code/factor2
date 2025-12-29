import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration
const CSV_PATH = './old_site/export/Categories_MJBQJCMTGG.csv';
const MAPPING_OUTPUT_PATH = './migration/category-mapping.json';
const DRY_RUN = process.env.DRY_RUN === 'true';
const RATE_LIMIT_DELAY = 500; // ms between API calls
const API_VERSION = '2024-10';

// Environment validation
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_CLI_TOKEN = process.env.SHOPIFY_CLI_TOKEN; // Token from Shopify CLI

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

interface CategoryMapping {
  volusionId: string;
  shopifyGid: string;
  handle: string;
  title: string;
}

// Utility functions
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeHandle(
  name: string,
  altUrl: string,
  categoryId: string,
  parentId: string,
  categoryMap: Map<string, VolusionCategory>
): string {
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

  // If has parent and not root, append parent name to avoid duplicates
  if (parentId !== '0') {
    const parent = categoryMap.get(parentId);
    if (parent) {
      const parentHandle = parent.categoryname.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      handle = `${parentHandle}-${handle}`;
    }
  }

  // If handle is empty, use category ID
  if (!handle) {
    handle = `category-${categoryId}`;
  }

  return handle;
}

function buildHierarchyPath(category: VolusionCategory, categoryMap: Map<string, VolusionCategory>): string {
  if (category.breadcrumb && category.breadcrumb.trim()) {
    return category.breadcrumb.trim();
  }

  const path: string[] = [];
  let current: VolusionCategory | undefined = category;

  while (current) {
    path.unshift(current.categoryname);
    if (current.parentid === '0') break;
    current = categoryMap.get(current.parentid);
  }

  return path.join(' > ');
}

// GraphQL mutation for creating collection
const CREATE_COLLECTION_MUTATION = `
  mutation collectionCreate($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection {
        id
        title
        handle
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

async function createCollection(
  category: VolusionCategory,
  hierarchyPath: string,
  categoryMap: Map<string, VolusionCategory>
): Promise<{ id: string; handle: string } | null> {
  const handle = sanitizeHandle(category.categoryname, category.alternateurl, category.categoryid, category.parentid, categoryMap);

  const input = {
    title: category.categoryname,
    handle: handle,
    descriptionHtml: category.categorydescription || '',
    seo: {
      title: category.metatag_title || category.categoryname,
      description: category.metatag_description || '',
    },
    metafields: [
      {
        namespace: 'category_migration',
        key: 'parent_id',
        value: category.parentid,
        type: 'single_line_text_field',
      },
      {
        namespace: 'category_migration',
        key: 'original_category_id',
        value: category.categoryid,
        type: 'single_line_text_field',
      },
      {
        namespace: 'category_migration',
        key: 'hierarchy_path',
        value: hierarchyPath,
        type: 'single_line_text_field',
      },
      {
        namespace: 'category_migration',
        key: 'sort_order',
        value: category.categoryorder || '0',
        type: 'single_line_text_field',
      },
    ],
  };

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would create collection:`, {
      title: input.title,
      handle: input.handle,
      parentId: category.parentid,
      hierarchyPath,
    });
    return { id: `gid://shopify/Collection/dry-run-${category.categoryid}`, handle };
  }

  try {
    const result = await shopifyGraphQL(CREATE_COLLECTION_MUTATION, { input });

    if (result.data?.collectionCreate?.userErrors?.length > 0) {
      console.error(`❌ Error creating collection "${category.categoryname}":`,
        result.data.collectionCreate.userErrors);
      return null;
    }

    const collection = result.data?.collectionCreate?.collection;
    if (!collection) {
      console.error(`❌ Failed to create collection "${category.categoryname}" - no collection returned`);
      return null;
    }

    return { id: collection.id, handle: collection.handle };
  } catch (error: any) {
    console.error(`❌ Exception creating collection "${category.categoryname}":`, error.message);
    return null;
  }
}

// Main migration function
async function migrateCategories() {
  console.log('🚀 Starting category migration...\n');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN' : '🔴 LIVE'}\n`);
  console.log(`Store: ${SHOPIFY_STORE}\n`);

  // Step 1: Parse CSV
  console.log('📖 Reading CSV file:', CSV_PATH);
  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as VolusionCategory[];

  console.log(`✓ Parsed ${records.length} categories from CSV\n`);

  // Step 2: Filter out invalid categories (ones with HTML/malformed data)
  const validCategories = records.filter(cat => {
    // Skip categories with no name or invalid structure
    if (!cat.categoryname || cat.categoryname.includes('<') || cat.categoryname.includes('http')) {
      return false;
    }
    return true;
  });
  console.log(`✓ Filtered to ${validCategories.length} valid categories (excluded ${records.length - validCategories.length} malformed)\n`);

  // Step 3: Build category map for hierarchy lookups
  const categoryMap = new Map<string, VolusionCategory>();
  validCategories.forEach(cat => categoryMap.set(cat.categoryid, cat));

  // Step 4: Sort categories by dependency (parents before children)
  const sortedCategories: VolusionCategory[] = [];
  const processed = new Set<string>();

  function addCategoryAndParents(category: VolusionCategory) {
    if (processed.has(category.categoryid)) return;

    // First add parent if it exists and hasn't been processed
    if (category.parentid !== '0') {
      const parent = categoryMap.get(category.parentid);
      if (parent) {
        addCategoryAndParents(parent);
      }
    }

    // Then add this category
    sortedCategories.push(category);
    processed.add(category.categoryid);
  }

  validCategories.forEach(cat => addCategoryAndParents(cat));
  console.log(`✓ Sorted ${sortedCategories.length} categories by dependency order\n`);

  // Step 5: Load existing mappings to prevent duplicates
  let existingMappings = new Map<string, CategoryMapping>();
  try {
    const existingContent = readFileSync(MAPPING_OUTPUT_PATH, 'utf-8');
    const existingArray = JSON.parse(existingContent) as CategoryMapping[];
    for (const mapping of existingArray) {
      existingMappings.set(mapping.volusionId, mapping);
    }
    console.log(`✓ Found ${existingMappings.size} existing category mappings\n`);
  } catch (error) {
    console.log(`ℹ️  No existing category mappings found (will create new file)\n`);
  }

  // Filter out already migrated categories
  const categoriesToMigrate = sortedCategories.filter(cat => !existingMappings.has(cat.categoryid));
  console.log(`✓ Will migrate ${categoriesToMigrate.length} categories (${existingMappings.size} already exist)\n`);

  if (categoriesToMigrate.length === 0) {
    console.log('✨ All categories already migrated!\n');
    return;
  }

  // Step 6: Migrate categories
  const mapping: CategoryMapping[] = Array.from(existingMappings.values());
  let successCount = existingMappings.size;
  let errorCount = 0;

  console.log('🔄 Creating collections...\n');
  console.log('='.repeat(60) + '\n');

  for (let i = 0; i < categoriesToMigrate.length; i++) {
    const category = categoriesToMigrate[i];
    const hierarchyPath = buildHierarchyPath(category, categoryMap);

    console.log(`[${i + 1}/${categoriesToMigrate.length}] Processing "${category.categoryname}"`);
    console.log(`   ID: ${category.categoryid} | Parent: ${category.parentid} | Path: ${hierarchyPath}`);

    const result = await createCollection(category, hierarchyPath, categoryMap);

    if (result) {
      const newMapping = {
        volusionId: category.categoryid,
        shopifyGid: result.id,
        handle: result.handle,
        title: category.categoryname,
      };
      mapping.push(newMapping);
      successCount++;

      // Save mapping immediately
      writeFileSync(MAPPING_OUTPUT_PATH, JSON.stringify(mapping, null, 2));

      console.log(`   ✓ Created: ${result.handle}\n`);
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
  console.log('✨ Migration Complete!\n');
  console.log(`Total categories in CSV: ${records.length}`);
  console.log(`Valid categories: ${validCategories.length}`);
  console.log(`✓ Successful: ${successCount}`);
  console.log(`✗ Failed: ${errorCount}`);
  console.log(`\nMapping saved to: ${MAPPING_OUTPUT_PATH}`);
  console.log('='.repeat(60));
}

// Run migration
migrateCategories().catch(error => {
  console.error('\n❌ Migration failed:', error);
  process.exit(1);
});
