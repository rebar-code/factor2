# Factor II Affidavit App Setup Guide

## Prerequisites

1. Node.js 18+ installed
2. Shopify CLI installed (`npm install -g @shopify/cli`)
3. Supabase account and project
4. SendGrid account (for email) or alternative email service

## Initial Setup

### 1. Install Dependencies

```bash
cd affidavit
npm install
```

### 2. Configure Environment Variables

Copy `env.example` to `.env` and fill in:

```bash
cp env.example .env
```

Required variables:
- `SHOPIFY_CLIENT_ID` - Your Shopify app Client ID
- `SHOPIFY_SECRET` - Your Shopify app Client Secret
- `SHOPIFY_SCOPES` - Comma-separated scopes (already set in shopify.app.toml)
- `SHOPIFY_APP_URL` - Your deployed app URL (e.g., https://your-app.vercel.app)

### 3. Setup Supabase Storage

1. Go to your Supabase project dashboard
2. Navigate to Storage
3. Create a new bucket named `affidavits`
4. Set it to **Private** (not public)
5. Configure RLS policies:

```sql
-- Customers can read their own files
CREATE POLICY "Customers can read own affidavits"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'affidavits' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```

Note: Admin access uses service role key, so no RLS policy needed for admin.

### 4. Create Metafield Definitions

Run the migration script to create required metafields:

```bash
cd migration
npm install  # if not already installed
tsx create-metafield-definitions.ts
```

This creates:
- Product metafields: `affidavit.requires_affidavit`, `affidavit.product_codes`
- Customer metafield: `app--factor2-affidavit.approved_affidavits`
- Order metafield: `app--factor2-affidavit.affidavit_submission`

### 5. Configure Shopify App

See `SHOPIFY_SETUP.md` for detailed instructions on setting up your app in the Shopify Partners dashboard.

Quick steps:
1. Create app in [partners.shopify.com](https://partners.shopify.com)
2. Get Client ID and Secret, add to `.env`
3. Update `shopify.app.toml` with your `client_id`
4. Configure scopes: `read_customers`, `write_customers`, `read_products`, `read_orders`, `write_orders`
5. Set up webhook: `orders/create` → `https://your-app-url.vercel.app/api/webhooks/orders/create`
6. Install app on your development store

### 6. Deploy to Vercel

```bash
# Install Vercel CLI if not already installed
npm install -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
```

## Usage

### Marking Products as Requiring Affidavit

1. Go to Shopify Admin > Products
2. Edit a product
3. Scroll to Metafields section
4. Set `affidavit.requires_affidavit` to `true`
5. Set `affidavit.product_codes` to comma-separated product codes (e.g., "A-100, B-200")

### Customer Flow

1. Customer browses product page
2. If product requires affidavit and customer is logged in:
   - System checks customer metafield for valid approval
   - If approved: Shows "Add to Cart" button
   - If not approved: Shows "Sign Affidavit" button
3. Customer clicks "Sign Affidavit", fills form, signs, submits
4. PDF is uploaded to Supabase, customer metafield updated to "pending"
5. Admin receives email notification
6. Customer can add to cart (order will be on hold until approved)

### Admin Flow

1. Admin receives email when affidavit submitted
2. Click "View PDF" or "Approve"/"Reject" links in email
3. Or go to order page in Shopify admin
4. See affidavit section with PDF viewer
5. Click "Approve" or "Reject"
6. If approved: Order proceeds, customer notified
7. If rejected: Order cancelled, customer notified

## Development

### Run Locally

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Type Check

```bash
npm run typecheck
```

## Troubleshooting

### Metafield Not Showing in Admin

- Ensure metafield definitions are created (run migration script)
- Check namespace/key matches exactly
- Refresh Shopify admin page

### PDF Upload Fails

- Verify Supabase credentials are correct
- Check bucket exists and is named `affidavits`
- Verify service role key has proper permissions

### Email Not Sending

- Check SendGrid API key is valid
- Verify `ADMIN_EMAIL` is set
- Check SendGrid account has verified sender
- Check email logs in SendGrid dashboard

### Affidavit Check Not Working

- Verify customer is logged in
- Check product metafields are set correctly
- Verify customer metafield structure matches expected format
- Check browser console for JavaScript errors

## File Structure

```
affidavit/
├── app/
│   ├── routes/              # API routes
│   │   ├── api.affidavits.submit.ts
│   │   ├── api.affidavits.$id.pdf.ts
│   │   ├── api.orders.affidavit-approve.ts
│   │   ├── api.orders.affidavit-reject.ts
│   │   └── api.webhooks.orders.create.ts
│   └── lib/                 # Utilities
│       ├── shopify.server.ts
│       ├── supabase.server.ts
│       ├── metafields.ts
│       ├── email.server.ts
│       └── pdf.server.ts
├── migration/
│   └── create-metafield-definitions.ts
└── shopify.app.toml
```

## Support

For issues or questions, check:
- Shopify App documentation: https://shopify.dev/docs/apps
- Supabase documentation: https://supabase.com/docs
- Remix documentation: https://remix.run/docs

