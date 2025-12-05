# Volusion to Shopify Migration Guide

Complete migration workflow to move your Volusion e-commerce site to Shopify with zero broken links.

## Overview

This migration uses a **multi-pass approach** to ensure:
- ✅ All embedded files (PDFs, images) are uploaded to Shopify
- ✅ All file URLs are updated correctly
- ✅ All internal product links are rewritten to Shopify URLs
- ✅ No broken links in the final migration
- ✅ Duplicate prevention (safe to re-run scripts)

## Prerequisites

1. **Authentication**: Run `npm run migrate:get-token` to obtain SHOPIFY_CLI_TOKEN
2. **Dependencies**: Run `npm install`
3. **CSV Files**: Ensure all export CSVs are in `old_site/export/`

## Migration Workflow

### Phase 0: CSV to JSON Conversion

Convert CSVs to clean, validated JSON for easier processing.

```bash
# Convert all CSVs to JSON
npm run convert:all

# Or run individually:
npm run convert:categories           # 116 categories
npm run convert:product-collections  # Product-category relationships
npm run convert:products             # All products
npm run convert:redirects            # URL redirects
```

**Output**: `migration/data/*.json` files

**What it does**:
- Decodes HTML entities
- Normalizes whitespace (fixes "Special  FX   Products" → "Special FX Products")
- Pre-computes handles
- Validates data
- Sorts categories by dependency order (parents before children)

---

### Phase 1: File Discovery & Upload

Extract all embedded files from content and upload to Shopify.

```bash
# Extract file references from descriptions
npm run extract:files

# Review: migration/data/files-to-upload.json

# Upload files to Shopify (dry-run first)
npm run upload:files:dry-run
npm run upload:files
```

**Output**: `migration/data/file-mapping.json`

**What it does**:
- Scans all product/category descriptions for file URLs
- Finds: PDFs, images (JPG, PNG, GIF, etc.), documents
- Downloads files from old site
- Uploads to Shopify Files API or CDN
- Creates mapping: `old_url` → `new_shopify_url`

---

### Phase 2: Extract Product Links

Find all internal product references in content (to be fixed in Phase 5).

```bash
npm run extract:product-links
```

**Output**: `migration/data/product-links.json`

**What it does**:
- Scans descriptions for product link patterns:
  - `https://www.factor2.com/ProductDetails.asp?ProductCode=A-4100`
  - `/ProductDetails.asp?ProductCode=A-4100`
  - `/product_p/A-4100.htm`
- Creates list of all products referenced in content
- Tracks where each link appears

---

### Phase 3: Migrate Categories

Migrate all categories to Shopify collections.

```bash
# Dry-run first
npm run migrate:categories:dry-run

# Run migration
npm run migrate:categories
```

**What it does**:
- Creates Shopify collections from categories
- Replaces file URLs using `file-mapping.json`
- Sets SEO metadata (title, description)
- Adds metafields to preserve hierarchy:
  - `category_migration.parent_id`
  - `category_migration.hierarchy_path`
  - `category_migration.original_category_id`
  - `category_migration.sort_order`
- **Duplicate detection**: Queries by handle before creating
- Rate-limited (500ms between calls)

**Notes**:
- Categories typically don't link to products, so no product link rewriting needed
- Use `--force` flag to update existing collections (TODO: implement)

---

### Phase 4: Migrate Products (First Pass)

Migrate all products with basic data. **Skip internal product link rewriting** (products don't exist yet).

```bash
# Dry-run first
npm run migrate:products:dry-run

# Run migration
npm run migrate:products
```

**Output**: `migration/data/product-mapping.json`

**What it does**:
- Creates Shopify products from products.json
- Replaces file URLs using `file-mapping.json`
- Uploads product images (photourl)
- Sets product data: price, inventory, weight, variants (TODO)
- Assigns products to collections using Categories_Products_Link data
- **Skips internal product link rewriting** (will be done in Phase 5)
- **Duplicate detection**: Queries by handle before creating
- Generates `product-mapping.json`: `{ "A-4100": "a-4100" }`

**TODO**:
- Implement Vision API for missing alt text
- Handle product variants from Options CSV

---

### Phase 5: Update Product Links (Second Pass)

Now that all products exist in Shopify, update descriptions with correct internal links.

```bash
# Dry-run first
npm run migrate:update-links:dry-run

# Run updates
npm run migrate:update-links
```

**Output**: `migration/data/link-updates.json`

**What it does**:
- Reads `product-links.json` (extracted in Phase 2)
- Reads `product-mapping.json` (created in Phase 4)
- For each product/category with internal links:
  - Fetches current description from Shopify
  - Replaces all old product URLs with new Shopify URLs
  - Updates via GraphQL API
- Patterns replaced:
  - `https://www.factor2.com/ProductDetails.asp?ProductCode=A-4100` → `/products/a-4100`
  - `/ProductDetails.asp?ProductCode=A-4100` → `/products/a-4100`
  - `/product_p/A-4100.htm` → `/products/a-4100`

---

### Phase 6: Collection Images & Navigation

Set collection featured images and build navigation menu.

```bash
# Set collection images from first product
npm run migrate:collection-images  # TODO: implement

# Create hierarchical navigation menu
npm run migrate:navigation  # TODO: implement
```

**What it does**:
- For each collection, find first product
- Set product's image as collection featured image
- Build navigation menu structure from category hierarchy
- Use metafields to determine parent-child relationships

---

### Phase 7: Redirects (Optional)

Import URL redirects to maintain SEO.

```bash
# Review redirects
cat migration/data/redirects.json

# Import to Shopify (manual or via app)
```

**What it does**:
- Uses `redirects.json` generated in Phase 0
- Import via:
  1. Shopify Bulk Redirects API
  2. Shopify app like "Easy Redirects"
- Redirects old Volusion URLs to new Shopify URLs

---

## File Structure

```
migration/
├── data/                          # Generated JSON files
│   ├── categories.json           # Cleaned categories
│   ├── products.json             # Cleaned products
│   ├── product-collections.json  # Product-category mappings
│   ├── redirects.json            # URL redirects
│   ├── files-to-upload.json      # Extracted file references
│   ├── file-mapping.json         # Old → new file URLs
│   ├── product-links.json        # Extracted product references
│   ├── product-mapping.json      # Product code → Shopify handle
│   └── link-updates.json         # Link replacement log
├── downloads/                     # Downloaded files (temporary)
├── convert-categories.ts          # CSV → JSON conversion
├── convert-products.ts
├── convert-product-collections.ts
├── convert-redirects.ts
├── extract-files.ts               # Extract file references
├── extract-product-links.ts       # Extract product links
├── upload-files.ts                # Upload files to Shopify
├── categories.ts                  # Migrate categories
├── products.ts                    # Migrate products (TODO)
├── update-product-links.ts        # Second pass: fix product links
└── get-token.ts                   # OAuth helper
```

## Data Mappings

### File Mapping (`file-mapping.json`)
```json
[
  {
    "old_url": "https://www.factor2.com/v/vspfiles/photos/10005-1.jpg",
    "new_url": "https://cdn.shopify.com/s/files/1/0123/4567/files/10005-1.jpg",
    "type": "image",
    "filename": "10005-1.jpg",
    "uploaded_at": "2024-01-15T10:30:00.000Z"
  }
]
```

### Product Mapping (`product-mapping.json`)
```json
[
  {
    "product_code": "A-4100",
    "shopify_handle": "a-4100",
    "shopify_id": "gid://shopify/Product/123456789"
  }
]
```

## Key Features

### Duplicate Prevention
All migration scripts check for existing entities before creating:
- Query by handle
- Skip if exists (or update with `--force` flag)
- Safe to re-run scripts

### Rate Limiting
All scripts include 500ms delays between API calls to respect Shopify rate limits.

### Dry-Run Mode
Test migrations without making changes:
```bash
DRY_RUN=true tsx migration/[script].ts
```

### Link Rewriting

**File Links**: Replaced in Phase 1 (categories) and Phase 4 (products)
- Uses `file-mapping.json`
- Updates src/href attributes

**Product Links**: Replaced in Phase 5 (second pass)
- Uses `product-mapping.json`
- Waits until all products exist

## Troubleshooting

### "No mapping found for product XXX"
- Product code in description doesn't exist in products.json
- Check if product was filtered out (hideproduct=Y)
- Manually add to product-mapping.json

### "Failed to upload file"
- File URL may be broken on old site
- Check `migration/downloads/` for downloaded files
- Manually upload to Shopify and update file-mapping.json

### "Duplicate handle"
- Multiple categories/products have same handle
- Review warnings in conversion output
- Manually adjust handles in JSON files

### Rate Limiting Errors
- Increase delay in scripts (change 500ms to 1000ms)
- Use smaller batches

## Next Steps

1. ✅ Phase 0: Convert CSVs to JSON
2. ✅ Phase 1: Extract and upload files
3. ✅ Phase 2: Extract product links
4. ✅ Phase 3: Migrate categories
5. ⏳ Phase 4: Implement `products.ts` migration script
6. ⏳ Phase 5: Update product links (second pass)
7. ⏳ Phase 6: Set collection images and create navigation
8. ⏳ Phase 7: Import redirects

## TODO

- [ ] Implement `products.ts` migration script
- [ ] Add Vision API for missing alt text
- [ ] Handle product variants from Options CSV
- [ ] Implement `set-collection-images.ts`
- [ ] Implement `create-navigation.ts`
- [ ] Add `--force` flag to update existing entities
- [ ] Add `--reupload-images` flag
- [ ] Implement blog articles migration (Articles CSV)
- [ ] Create validation script to check for broken links

## Questions?

Contact the migration team or review the plan document at:
`.claude/plans/eager-popping-peach.md`
