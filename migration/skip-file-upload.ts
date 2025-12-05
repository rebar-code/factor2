import { readFileSync, writeFileSync } from 'fs';

// Create a passthrough file mapping (no uploads, keep old URLs)
const filesPath = './migration/data/files-to-upload.json';
const outputPath = './migration/data/file-mapping.json';

console.log('⏭️  Creating passthrough file mapping (skipping uploads)...\n');

const files = JSON.parse(readFileSync(filesPath, 'utf-8')) as Array<{
  url: string;
  type: string;
}>;

// Use object structure keyed by old_url
const mappings: { [key: string]: any } = {};

files.forEach(file => {
  mappings[file.url] = {
    old_url: file.url,
    new_url: file.url, // Keep old URL (no upload)
    type: file.type,
    filename: decodeURIComponent(file.url.split('/').pop() || ''),
    uploaded_at: new Date().toISOString(),
  };
});

writeFileSync(outputPath, JSON.stringify(mappings, null, 2));

console.log(`✅ Created passthrough mapping for ${Object.keys(mappings).length} files`);
console.log(`   Old URLs will be preserved in descriptions`);
console.log(`   Output: ${outputPath}\n`);
console.log('💡 You can upload files manually later and update this mapping\n');
