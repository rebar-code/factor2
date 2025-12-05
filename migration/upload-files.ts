import { readFileSync, writeFileSync, mkdirSync, createWriteStream, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import { createReadStream } from 'fs';
import * as https from 'https';
import * as http from 'http';
import { basename } from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration
const FILES_PATH = './migration/data/files-to-upload.json';
const OUTPUT_PATH = './migration/data/file-mapping.json';
const ERRORS_PATH = './migration/data/file-upload-errors.json';
const DOWNLOAD_DIR = './migration/downloads';
const SHOPIFY_STORE = process.env.SHOPIFY_STORE!;
const SHOPIFY_CLI_TOKEN = process.env.SHOPIFY_CLI_TOKEN!;
const API_VERSION = '2024-10';
const DRY_RUN = process.env.DRY_RUN === 'true';

// Types
interface FileReference {
  url: string;
  type: 'pdf' | 'image' | 'document' | 'unknown';
  found_in: Array<{
    type: 'category' | 'product';
    id: string;
    name: string;
  }>;
}

interface FileMappingEntry {
  old_url: string;
  new_url: string;
  type: string;
  filename: string;
  uploaded_at: string;
}

interface FileMappings {
  [oldUrl: string]: FileMappingEntry;
}

// GraphQL queries
const STAGED_UPLOADS_CREATE = `
  mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const FILE_CREATE = `
  mutation fileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        alt
        ... on GenericFile {
          url
        }
        ... on MediaImage {
          image {
            url
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const GET_FILE = `
  query getFile($id: ID!) {
    node(id: $id) {
      ... on GenericFile {
        id
        url
      }
      ... on MediaImage {
        id
        image {
          url
        }
      }
    }
  }
`;

// Utility functions
async function shopifyGraphQL(query: string, variables: any = {}): Promise<any> {
  const url = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_CLI_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await response.json() as any;
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json;
}

async function getPermanentUrl(fileId: string, maxRetries: number = 10): Promise<string | null> {
  for (let i = 0; i < maxRetries; i++) {
    const response = await shopifyGraphQL(GET_FILE, { id: fileId });
    const file = response.data.node;

    if (file) {
      const url = file.url || file.image?.url;
      if (url && !url.includes('shopify-staged-uploads')) {
        return url; // Got permanent URL
      }
    }

    // Wait before retry (exponential backoff)
    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
  }

  return null; // Couldn't get permanent URL
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Ensure URL is properly encoded
    let encodedUrl = url;
    try {
      // Parse URL to handle encoding properly
      const urlObj = new URL(url);
      // Pathname should already be encoded by extract-files.ts
      encodedUrl = urlObj.toString();
    } catch (e) {
      // If URL parsing fails, use as-is
    }

    const protocol = encodedUrl.startsWith('https') ? https : http;

    protocol.get(encodedUrl, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirects
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          return downloadFile(redirectUrl, outputPath).then(resolve).catch(reject);
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }

      const fileStream = createWriteStream(outputPath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });

      fileStream.on('error', (err) => {
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function uploadToShopify(filePath: string, filename: string, mimeType: string): Promise<string> {
  // Decode filename for alt text
  const decodedFilename = decodeURIComponent(filename);

  // Step 1: Create staged upload
  console.log(`  📤 Creating staged upload for ${decodedFilename}...`);

  const stagedResponse = await shopifyGraphQL(STAGED_UPLOADS_CREATE, {
    input: [{
      filename: decodedFilename,
      mimeType,
      resource: 'FILE',
      httpMethod: 'POST',
    }],
  });

  const staged = stagedResponse.data.stagedUploadsCreate.stagedTargets[0];
  if (!staged) {
    throw new Error('Failed to create staged upload');
  }

  // Step 2: Upload file to staged URL
  console.log(`  ⬆️  Uploading to Shopify CDN...`);

  const formData = new FormData();
  for (const param of staged.parameters) {
    formData.append(param.name, param.value);
  }

  const fileBuffer = readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: mimeType });
  formData.append('file', blob, decodedFilename);

  const uploadResponse = await fetch(staged.url, {
    method: 'POST',
    body: formData,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload file: ${uploadResponse.statusText}`);
  }

  // Step 3: Create file record in Shopify
  console.log(`  📝 Creating file record in Shopify...`);

  const fileResponse = await shopifyGraphQL(FILE_CREATE, {
    files: [{
      alt: decodedFilename,
      contentType: 'FILE',
      originalSource: staged.resourceUrl,
    }],
  });

  // Check for errors
  const userErrors = fileResponse.data.fileCreate.userErrors;
  if (userErrors && userErrors.length > 0) {
    throw new Error(`File create errors: ${JSON.stringify(userErrors)}`);
  }

  const file = fileResponse.data.fileCreate.files[0];
  if (!file) {
    throw new Error('Failed to create file record');
  }

  // Get file ID for polling
  const fileId = file.id;
  if (!fileId) {
    throw new Error('No file ID returned from Shopify');
  }

  // Poll for permanent CDN URL
  console.log(`  ⏳ Waiting for permanent CDN URL...`);
  const permanentUrl = await getPermanentUrl(fileId);

  if (!permanentUrl) {
    console.log(`  ⚠️  Could not get permanent URL after retries, using staged URL`);
    const fallbackUrl = file.url || file.image?.url || staged.resourceUrl;
    return fallbackUrl;
  }

  console.log(`  ✅ Uploaded: ${permanentUrl}`);

  return permanentUrl;
}

function getMimeType(url: string): string {
  const ext = url.toLowerCase().split('.').pop() || '';

  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    zip: 'application/zip',
    txt: 'text/plain',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

// Main upload function
async function uploadFiles() {
  console.log('📦 Uploading files to Shopify...\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be uploaded\n');
  }

  // Step 1: Load files to upload
  console.log('📖 Reading files list:', FILES_PATH);
  const filesContent = readFileSync(FILES_PATH, 'utf-8');
  const files = JSON.parse(filesContent) as FileReference[];
  console.log(`✓ Found ${files.length} files to process\n`);

  // Step 2: Load existing mappings (if any)
  let mappings: FileMappings = {};
  try {
    const existingContent = readFileSync(OUTPUT_PATH, 'utf-8');
    const parsed = JSON.parse(existingContent);

    // Handle old array format or empty array - convert to object
    if (Array.isArray(parsed)) {
      console.log('⚠️  Found array format, converting to object format...\n');
      mappings = {};
    } else {
      mappings = parsed as FileMappings;
      console.log(`✓ Loaded ${Object.keys(mappings).length} existing mappings\n`);
    }
  } catch (e) {
    console.log('✓ No existing mappings found, starting fresh\n');
  }

  // Step 3: Create download directory
  mkdirSync(DOWNLOAD_DIR, { recursive: true });

  // Step 4: Process each file
  const errors: Array<{ url: string; error: string; type: string }> = [];
  let skipped = 0;
  let uploaded = 0;
  let notFound = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.log(`\n[${i + 1}/${files.length}] Processing: ${file.url}`);

    try {
      const filename = basename(file.url.split('?')[0]);
      const downloadPath = `${DOWNLOAD_DIR}/${filename}`;
      const mimeType = getMimeType(file.url);

      // Skip if already uploaded
      if (mappings[file.url]) {
        console.log(`  ⏭️  Already uploaded, skipping...`);
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`  🔍 Would download: ${file.url}`);
        console.log(`  🔍 Would upload as: ${filename} (${mimeType})`);
        mappings[file.url] = {
          old_url: file.url,
          new_url: `https://cdn.shopify.com/s/files/1/example/${filename}`,
          type: file.type,
          filename: decodeURIComponent(filename),
          uploaded_at: new Date().toISOString(),
        };
        continue;
      }

      // Download file
      console.log(`  ⬇️  Downloading...`);
      await downloadFile(file.url, downloadPath);

      // Upload to Shopify
      const newUrl = await uploadToShopify(downloadPath, filename, mimeType);

      // Add to mappings
      mappings[file.url] = {
        old_url: file.url,
        new_url: newUrl,
        type: file.type,
        filename: decodeURIComponent(filename),
        uploaded_at: new Date().toISOString(),
      };

      // Write to file immediately after each successful upload
      mkdirSync('./migration/data', { recursive: true });
      writeFileSync(OUTPUT_PATH, JSON.stringify(mappings, null, 2));

      uploaded++;

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error: any) {
      const is404 = error.message.includes('404');

      if (is404) {
        console.log(`  ⚠️  File not found (404) - skipping...`);
        notFound++;
      } else {
        console.log(`  ❌ Error: ${error.message}`);
      }

      errors.push({
        url: file.url,
        error: error.message,
        type: is404 ? '404' : 'other',
      });
    }
  }

  // Save errors to file
  if (errors.length > 0) {
    writeFileSync(ERRORS_PATH, JSON.stringify(errors, null, 2));
  }

  // Final summary
  const notFoundErrors = errors.filter(e => e.type === '404');
  const otherErrors = errors.filter(e => e.type !== '404');

  console.log('\n' + '='.repeat(60));
  console.log(`\n✨ File upload complete!\n`);
  console.log(`Total files: ${files.length}`);
  console.log(`Uploaded (this run): ${uploaded}`);
  console.log(`Skipped (already uploaded): ${skipped}`);
  console.log(`Not found (404): ${notFoundErrors.length}`);
  console.log(`Other errors: ${otherErrors.length}`);
  console.log(`\nTotal mappings in file: ${Object.keys(mappings).length}`);
  console.log(`Output file: ${OUTPUT_PATH}`);
  if (errors.length > 0) {
    console.log(`Errors file: ${ERRORS_PATH}`);
  }

  if (notFoundErrors.length > 0) {
    console.log(`\n⚠️  Files not found on old site (404):`);
    notFoundErrors.slice(0, 5).forEach(err => {
      console.log(`   - ${err.url}`);
    });
    if (notFoundErrors.length > 5) {
      console.log(`   ... and ${notFoundErrors.length - 5} more`);
    }
  }

  if (otherErrors.length > 0) {
    console.log(`\n❌ Other errors:`);
    otherErrors.slice(0, 5).forEach(err => {
      console.log(`   - ${err.url}: ${err.error}`);
    });
    if (otherErrors.length > 5) {
      console.log(`   ... and ${otherErrors.length - 5} more`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n💡 Next step:');
  console.log('   Use file-mapping.json when migrating categories and products\n');
}

// Run upload
uploadFiles().catch(error => {
  console.error('\n❌ File upload failed:', error);
  process.exit(1);
});
