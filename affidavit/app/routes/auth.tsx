import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import crypto from "crypto";

// OAuth configuration
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!;
const SCOPES = "read_customers,write_customers,read_orders,write_orders";

export async function loader({ request }: LoaderFunctionArgs) {
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
