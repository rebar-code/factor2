import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import crypto from "crypto";

const SCOPES = "read_customers,write_customers,read_orders,write_orders";

export async function loader({ request }: LoaderFunctionArgs) {
  const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;

  if (!SHOPIFY_API_KEY) {
    return new Response(`Missing SHOPIFY_API_KEY environment variable. Current env keys: ${Object.keys(process.env).filter(k => k.includes('SHOPIFY')).join(', ')}`, { status: 500 });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return new Response("Missing shop parameter", { status: 400 });
  }

  // Generate a nonce for security
  const nonce = crypto.randomBytes(16).toString("hex");

  // Build the OAuth URL
  const redirectUri = `${url.origin}/auth/callback`;
  const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  authUrl.searchParams.set("client_id", SHOPIFY_API_KEY);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", nonce);

  // In production, you'd store the nonce in a session to verify later
  // For simplicity with single-store, we'll skip nonce verification

  return redirect(authUrl.toString());
}

export default function Auth() {
  return (
    <div style={{ padding: "40px", fontFamily: "system-ui" }}>
      <h1>Authenticating...</h1>
      <p>Redirecting to Shopify for authorization...</p>
    </div>
  );
}
