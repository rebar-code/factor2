# Testing Guide

## Current Status

Your Express server is running on port 3000. Now you need to:

1. **Set up Shopify authentication** (OAuth flow)
2. **Test API endpoints**
3. **Test theme integration**

## Step 1: Use Shopify CLI for Development (Recommended)

Stop your current `npm run dev` server and use Shopify CLI instead:

```bash
# Stop current server (Ctrl+C)

# Use Shopify CLI dev command (handles tunneling automatically)
npm run shopify:dev
```

This will:
- Create a secure tunnel to your local server
- Handle OAuth authentication automatically
- Provide a URL to install/test your app

## Step 2: Test API Endpoints Directly

While your server is running on `localhost:3000`, you can test endpoints:

### Test Root Route
```bash
curl http://localhost:3000/
```
Should return: "Factor II Affidavit App"

### Test Affidavit Submit Endpoint (requires auth)
```bash
curl -X POST http://localhost:3000/api/affidavits/submit \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

**Note**: API endpoints require Shopify authentication, so they'll fail without proper session.

## Step 3: Test with Shopify CLI Tunnel

1. **Start Shopify dev server**:
   ```bash
   npm run shopify:dev
   ```

2. **Install app on your development store**:
   - The CLI will provide an installation URL
   - Or go to: `https://factor2inc.myshopify.com/admin/apps`
   - Find "factor-2-affidavit" and click Install

3. **Test authentication**:
   - After installation, you'll be redirected to your app
   - Should see "Factor II Affidavit App" page

## Step 4: Test Theme Integration

1. **Mark a product as requiring affidavit**:
   - Go to Shopify Admin > Products
   - Edit a product
   - Add metafield: `affidavit.requires_affidavit` = `true`
   - Add metafield: `affidavit.product_codes` = `A-100, B-200`

2. **View product page**:
   - Go to your storefront: `https://factor2inc.myshopify.com/products/[product-handle]`
   - If customer is logged in and has no valid affidavit:
     - Should see "Sign Affidavit Required" button instead of "Add to Cart"
   - If customer has valid affidavit:
     - Should see normal "Add to Cart" button

3. **Test affidavit form**:
   - Click "Sign Affidavit Required" button
   - Modal should open with form
   - Fill out form and submit
   - Should upload PDF and send email

## Step 5: Test Admin Approval Flow

1. **Check email** (if SendGrid configured):
   - Should receive email with PDF link and approve/reject buttons

2. **Test approval endpoint** (via email link or directly):
   ```bash
   curl -X POST http://localhost:3000/api/orders/affidavit-approve \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "submissionId=test-id&customerId=123&productCodes=A-100"
   ```

3. **Check customer metafield**:
   - Go to Shopify Admin > Customers
   - Find customer
   - Check metafield `app--factor2-affidavit.approved_affidavits`
   - Should show approved status

## Step 6: Test Order Webhook

1. **Create a test order** with restricted product:
   - Customer adds product to cart
   - Completes checkout
   - Order should be created

2. **Check webhook**:
   - Webhook should fire: `POST /api/webhooks/orders/create`
   - Check server logs for webhook receipt
   - Order should be put on hold if affidavit pending

## Common Issues & Solutions

### "Authentication failed"
- Make sure `.env` has correct `SHOPIFY_CLIENT_ID` and `SHOPIFY_SECRET`
- Verify `shopify.app.factor-2-affidavit.toml` has correct `client_id`
- Check redirect URLs match in Partners dashboard

### "Metafield not found"
- Run metafield creation script: `tsx migration/create-metafield-definitions.ts`
- Refresh Shopify admin page
- Verify namespace/key matches exactly

### "PDF upload fails"
- Check Supabase credentials in `.env`
- Verify `affidavits` bucket exists and is private
- Check Supabase RLS policies

### "Email not sending"
- Verify `SENDGRID_API_KEY` in `.env`
- Check SendGrid account has verified sender
- Check server logs for email errors

## Next Steps

1. ✅ Server running on port 3000
2. ⏭️ Use `npm run shopify:dev` for proper tunneling
3. ⏭️ Install app on development store
4. ⏭️ Create metafield definitions
5. ⏭️ Test product page with affidavit requirement
6. ⏭️ Test form submission
7. ⏭️ Test admin approval flow

## Quick Test Checklist

- [ ] Server starts without errors
- [ ] Root route (`/`) loads
- [ ] Shopify CLI tunnel works (`npm run shopify:dev`)
- [ ] App installs on development store
- [ ] Metafields created successfully
- [ ] Product page shows "Sign Affidavit" button
- [ ] Affidavit modal opens and form works
- [ ] Form submission creates PDF
- [ ] Email notification sent (if configured)
- [ ] Admin can approve/reject
- [ ] Order webhook fires correctly

