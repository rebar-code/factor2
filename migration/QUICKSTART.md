# Migration Quick Start Guide

Complete command sequence to extract and prepare all data for migration.

## Prerequisites

```bash
# Ensure you have SHOPIFY_CLI_TOKEN in .env
npm install
```

## Step-by-Step Commands

### Phase 0: CSV to JSON Conversion

Convert all CSVs to clean, validated JSON files:

```bash
# Convert categories
npm run convert:categories

# Convert product-collections mapping
npm run convert:product-collections

# Convert products
npm run convert:products

# Generate redirects
npm run convert:redirects

# Or run all at once:
npm run convert:all
```

**Output files:**
- `migration/data/categories.json` (116 categories)
- `migration/data/product-collections.json` (2081 product-category links)
- `migration/data/products.json` (337 products)
- `migration/data/redirects.json` (URL redirects)

---

### Phase 1: Extract File References

Scan all descriptions for embedded files (PDFs, images, documents):

```bash
npm run extract:files
```

**Output:** `migration/data/files-to-upload.json`

**What it extracts:**
- PDF documents
- Images (JPG, PNG, GIF, WebP, SVG)
- Documents (DOC, DOCX, XLS, XLSX, ZIP)
- From: product descriptions, category descriptions, features, tech specs

---

### Phase 2: Extract Product Link References

Find all internal product links that need to be rewritten:

```bash
npm run extract:product-links
```

**Output:** `migration/data/product-links.json`

**What it finds:**
- `https://www.factor2.com/ProductDetails.asp?ProductCode=A-4100`
- `/ProductDetails.asp?ProductCode=A-4100`
- `/product_p/A-4100.htm`
- All cross-references between products

---

### Phase 3: Upload Files to Shopify

Download and upload all extracted files:

```bash
# Dry-run first to see what will be uploaded
npm run upload:files:dry-run

# Then upload for real
npm run upload:files
```

**Output:** `migration/data/file-mapping.json`

**What it does:**
- Downloads files from old Volusion site
- Uploads to Shopify Files API / CDN
- Creates mapping: old URL → new Shopify URL
- Files saved to: `migration/downloads/` (temporary)

---

### Phase 4: Migrate Categories

Migrate all categories to Shopify collections:

```bash
# Dry-run first
npm run migrate:categories:dry-run

# Then migrate
npm run migrate:categories
```

**What it does:**
- Creates Shopify collections from categories
- Replaces file URLs using `file-mapping.json`
- Sets SEO metadata
- Adds hierarchy metafields
- Duplicate detection (safe to re-run)

---

### Phase 5: Migrate Products (First Pass)

Migrate all products WITHOUT internal product links:

```bash
# Dry-run first
npm run migrate:products:dry-run

# Then migrate
npm run migrate:products
```

**Output:** `migration/data/product-mapping.json`

**What it does:**
- Creates Shopify products
- Replaces file URLs using `file-mapping.json`
- Uploads product images
- Assigns products to collections
- **SKIPS internal product link rewriting** (products don't exist yet!)
- Generates product-mapping.json: product code → Shopify handle

---

### Phase 6: Update Product Links (Second Pass)

Now that products exist, rewrite all internal product links:

```bash
# Dry-run first
npm run migrate:update-links:dry-run

# Then update
npm run migrate:update-links
```

**Output:** `migration/data/link-updates.json`

**What it does:**
- Fetches products/collections from Shopify
- Replaces all old product URLs with new Shopify URLs
- Uses `product-mapping.json` for URL lookups
- Updates descriptions via GraphQL API

---

## Summary: Complete Migration Sequence

Run these commands in order:

```bash
# 1. Convert CSVs
npm run convert:all

# 2. Extract references
npm run extract:files
npm run extract:product-links

# 3. Upload files
npm run upload:files:dry-run  # check first
npm run upload:files           # then run

# 4. Migrate categories
npm run migrate:categories:dry-run  # check first
npm run migrate:categories          # then run

# 5. Migrate products (without product links)
npm run migrate:products:dry-run    # check first
npm run migrate:products            # then run

# 6. Update product links (second pass)
npm run migrate:update-links:dry-run  # check first
npm run migrate:update-links          # then run
```

---

## Review Generated Data

After each phase, review the output files:

```bash
# Check conversions
ls -lh migration/data/*.json

# View categories
cat migration/data/categories.json | head -50

# View products
cat migration/data/products.json | head -50

# Check file extraction results
cat migration/data/files-to-upload.json | head -50

# Check product links
cat migration/data/product-links.json | head -50
```

---

## Current Status

✅ **Phase 0**: CSV conversions complete
- 116 categories converted
- 337 products converted
- 2081 product-category links converted
- Redirects generated

⏳ **Phase 1-6**: Ready to run

---

## Important Notes

1. **Always run dry-run first** to preview changes
2. **File uploads take time** - be patient during Phase 3
3. **Product migration is multi-pass** - Phase 5 creates products, Phase 6 fixes links
4. **Safe to re-run** - All scripts have duplicate detection
5. **Rate limited** - Scripts use 500ms delays between API calls

---

## Troubleshooting

**"No mapping found for product XXX"**
- Product doesn't exist in products.json
- Check if filtered out (hideproduct=Y)

**"Failed to upload file"**
- File URL may be broken on old site
- Check `migration/downloads/` for downloaded files
- Manually upload and update file-mapping.json

**Rate limiting errors**
- Increase delay in scripts (500ms → 1000ms)
- Use smaller batches

---

## Next Steps After Migration

- [ ] Set collection featured images
- [ ] Create navigation menu from hierarchy
- [ ] Import URL redirects to Shopify
- [ ] Handle product variants (Options CSV)
- [ ] Test all links on new Shopify site
- [ ] Run validation script for broken links

See `migration/README.md` for full documentation.
