# Factor II Affidavit Compliance App

Private Shopify app for managing Factor II product affidavits.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `env.example` to `.env` and fill in your credentials:
```bash
cp env.example .env
```

3. Run development server:
```bash
# For Shopify app development (recommended - handles tunneling)
npm run shopify:dev

# OR for local Remix development
npm run dev
```

## Project Structure

- `app/routes/` - API routes and admin pages
- `app/lib/` - Shared utilities (Shopify client, Supabase, email)
- `extensions/` - Theme app extensions (React blocks)
- `migration/` - Metafield definition scripts

## Environment Variables

See `env.example` for required variables.

Required environment variables:
- `SHOPIFY_CLIENT_ID` - Shopify app Client ID
- `SHOPIFY_SECRET` - Shopify app Client Secret
- `SHOPIFY_APP_URL` - Your deployed app URL
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `SENDGRID_API_KEY` - SendGrid API key for emails
- `ADMIN_EMAIL` - Email address for affidavit notifications

## Deployment

Deploy to Vercel:
```bash
vercel deploy
```

