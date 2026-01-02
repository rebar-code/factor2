# Shopify App Setup Guide

## Step 1: Create App in Shopify Partners Dashboard

1. Go to [partners.shopify.com](https://partners.shopify.com) and log in
2. Navigate to **Apps** in the left sidebar
3. Click **Create app** button
4. Choose **Create app manually** (not from template)
5. Fill in:
   - **App name**: Factor II Affidavit Manager (or your preferred name)
   - **App URL**: This will be your deployed app URL (e.g., `https://factor2.vercel.app`)
   - **Allowed redirection URL(s)**: 
     - `https://factor2.vercel.app/auth/callback`
     - `https://factor2.vercel.app/auth/shopify/callback`
     - `https://factor2.vercel.app/api/auth/callback`
   - Click **Create app**

## Step 2: Configure App Settings

### App Credentials
1. In your app's overview page, go to **Client credentials**
2. Copy the **Client ID** and **Client secret**
3. Add these to your `.env` file:
   ```
   SHOPIFY_CLIENT_ID=your_client_id_here
   SHOPIFY_SECRET=your_client_secret_here
   ```

### API Scopes
1. Go to **Configuration** > **Scopes**
2. Enable the following scopes:
   - `read_customers`
   - `write_customers`
   - `read_products`
   - `read_orders`
   - `write_orders`
3. Click **Save**

### App URL Configuration
1. Go to **Configuration** > **App URL**
2. Set:
   - **App URL**: `https://factor2.vercel.app`
   - **Allowed redirection URL(s)**: (same as above)
3. Click **Save**

## Step 3: Update shopify.app.toml

Update your `shopify.app.toml` file with the Client ID:

```toml
name = "factor2-affidavit"
client_id = "your_client_id_here"  # From Partners dashboard
application_url = "https://factor2.vercel.app"
embedded = true

[access_scopes]
scopes = "read_customers,write_customers,read_products,read_orders,write_orders"

[auth]
redirect_urls = [
  "https://factor2.vercel.app/auth/callback",
  "https://factor2.vercel.app/auth/shopify/callback",
  "https://factor2.vercel.app/api/auth/callback"
]
```

## Step 4: Setup Webhooks

1. Go to **Configuration** > **Webhooks**
2. Click **Create webhook**
3. Configure:
   - **Event**: `Order creation`
   - **Format**: JSON
   - **URL**: `https://factor2.vercel.app/api/webhooks/orders/create`
   - **API version**: `2024-10`
4. Click **Save**

## Step 5: Install App on Development Store

### Option A: Using Shopify CLI (Recommended for Development)

1. Make sure you're logged into Shopify CLI:
   ```bash
   shopify auth login
   ```

2. Link your app to the Partners app:
   ```bash
   cd affidavit
   shopify app link
   ```
   - Enter your Client ID when prompted
   - This will link your local app to the Partners dashboard app

3. Start development server:
   ```bash
   npm run shopify:dev
   ```
   - This uses `shopify app dev` which handles tunneling automatically
   - The CLI will provide a preview URL and handle authentication
   - The app will be accessible through the tunnel
   
   **OR** use Remix dev server directly:
   ```bash
   npm run dev
   ```
   - This runs Remix dev server on localhost (for local testing)
   - You'll need to set up tunneling separately for Shopify to access it

4. Install on your development store:
   - The CLI will provide a URL to install the app
   - Or go to your development store admin
   - Navigate to **Apps** > **App and sales channel settings**
   - Find your app and click **Install**

### Option B: Manual Installation

1. In Partners dashboard, go to **Test and distribute** > **Development stores**
2. Select your development store
3. Go to **Apps** > **App and sales channel settings**
4. Find your app and click **Install**
5. Authorize the app with the requested scopes

## Step 6: Development Store Setup

1. Go to your development store admin: `https://your-store.myshopify.com/admin`
2. Navigate to **Settings** > **Customer accounts**
3. Ensure **Accounts are optional** or **Accounts are required** is set (not "Accounts are disabled")
   - This is needed for customers to log in and submit affidavits

## Step 7: Test the Setup

1. **Test app installation**:
   - Go to your store admin
   - Navigate to **Apps**
   - You should see your app listed

2. **Test API access**:
   - Create a test product
   - Set metafields (see below)
   - Try accessing product data through the app

3. **Test webhook**:
   - Create a test order
   - Check your app logs to see if webhook is received

## Step 8: Configure Products for Affidavit

1. Go to **Products** in your Shopify admin
2. Edit a product that requires affidavit
3. Scroll to **Metafields** section (or use **Custom data**)
4. Add metafields:
   - **Namespace and key**: `affidavit.requires_affidavit`
   - **Type**: Boolean
   - **Value**: `true`
   
   - **Namespace and key**: `affidavit.product_codes`
   - **Type**: List of single line text
   - **Value**: `A-100, B-200` (comma-separated product codes)

## Troubleshooting

### App Not Installing
- Check that `client_id` in `shopify.app.toml` matches Partners dashboard
- Verify redirect URLs match exactly
- Check that scopes are correctly configured

### Webhook Not Working
- Verify webhook URL is accessible (deployed app, not localhost)
- Check webhook format is JSON
- Verify API version matches (2024-10)
- Check app logs for webhook delivery errors

### Authentication Errors
- Verify `SHOPIFY_CLIENT_ID` and `SHOPIFY_SECRET` in `.env`
- Check that redirect URLs match exactly in Partners dashboard
- Ensure app URL is correct and accessible

### Metafields Not Showing
- Run the metafield creation script: `tsx migration/create-metafield-definitions.ts`
- Refresh the Shopify admin page
- Check namespace/key matches exactly (case-sensitive)

## Next Steps

After setup is complete:
1. Deploy your app to Vercel (or your hosting platform)
2. Update app URLs in Partners dashboard to production URL
3. Test the full affidavit flow:
   - Customer login
   - Product with affidavit requirement
   - Form submission
   - Admin approval/rejection

## Useful Links

- [Shopify Partners Dashboard](https://partners.shopify.com)
- [Shopify App Development Docs](https://shopify.dev/docs/apps)
- [Shopify CLI Documentation](https://shopify.dev/docs/apps/tools/cli)
- [Remix Shopify App Template](https://github.com/Shopify/shopify-app-template-remix)

