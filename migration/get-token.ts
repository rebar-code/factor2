import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import * as dotenv from 'dotenv';
import * as http from 'http';
import { parse } from 'url';

dotenv.config();

const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_SECRET = process.env.SHOPIFY_SECRET;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;

if (!SHOPIFY_CLIENT_ID || !SHOPIFY_SECRET || !SHOPIFY_STORE) {
  console.error('❌ Missing required env variables: SHOPIFY_CLIENT_ID, SHOPIFY_SECRET, SHOPIFY_STORE');
  process.exit(1);
}

const SCOPES = 'write_collections,read_collections,write_products,read_products,write_files,read_files,write_content,read_content';
const REDIRECT_URI = 'http://localhost:3000/callback';

async function getAccessToken() {
  console.log('🔐 Getting access token for your Shopify store...\n');

  // Step 1: Generate auth URL
  const authUrl = `https://${SHOPIFY_STORE}/admin/oauth/authorize?` +
    `client_id=${SHOPIFY_CLIENT_ID}&` +
    `scope=${SCOPES}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

  console.log('📋 Steps to get your access token:\n');
  console.log('1. Open this URL in your browser:');
  console.log(`\n   ${authUrl}\n`);
  console.log('2. Click "Install app" to authorize');
  console.log('3. You\'ll be redirected to localhost:3000/callback');
  console.log('4. Copy the "code" parameter from the URL');
  console.log('5. Paste it below when prompted\n');

  // Start local server to catch redirect
  const server = http.createServer(async (req, res) => {
    const parsedUrl = parse(req.url!, true);

    if (parsedUrl.pathname === '/callback') {
      const code = parsedUrl.query.code as string;

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>✅ Success!</h1><p>You can close this window and return to your terminal.</p>');

        // Exchange code for access token
        const tokenUrl = `https://${SHOPIFY_STORE}/admin/oauth/access_token`;
        const response = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: SHOPIFY_CLIENT_ID,
            client_secret: SHOPIFY_SECRET,
            code: code,
          }),
        });

        const data = await response.json() as any;

        if (data.access_token) {
          // Save to .env
          const envPath = '.env';
          const envContent = readFileSync(envPath, 'utf-8');

          if (envContent.includes('SHOPIFY_CLI_TOKEN=')) {
            // Replace existing token
            const updatedContent = envContent.replace(
              /SHOPIFY_CLI_TOKEN=.*/,
              `SHOPIFY_CLI_TOKEN=${data.access_token}`
            );
            writeFileSync(envPath, updatedContent);
          } else {
            // Append new token
            appendFileSync(envPath, `\nSHOPIFY_CLI_TOKEN=${data.access_token}\n`);
          }

          console.log('\n✅ Access token saved to .env!');
          console.log('You can now run: npm run migrate:categories:dry-run\n');

          server.close();
          process.exit(0);
        } else {
          console.error('\n❌ Failed to get access token:', data);
          server.close();
          process.exit(1);
        }
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('No code provided');
        server.close();
      }
    }
  });

  server.listen(3000, () => {
    console.log('🌐 Local server started on http://localhost:3000');
    console.log('⏳ Waiting for OAuth callback...\n');

    // Try to open browser automatically
    const openCmd = process.platform === 'darwin' ? 'open' :
                    process.platform === 'win32' ? 'start' : 'xdg-open';

    import('child_process').then(({ exec }) => {
      exec(`${openCmd} "${authUrl}"`, (error) => {
        if (error) {
          console.log('💡 Could not open browser automatically. Please open the URL manually.\n');
        }
      });
    });
  });
}

getAccessToken().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
