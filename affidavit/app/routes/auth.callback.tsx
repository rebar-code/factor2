import { json, type LoaderFunctionArgs } from "@remix-run/node";
import crypto from "crypto";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!;

function verifyHmac(query: URLSearchParams): boolean {
  const hmac = query.get("hmac");
  if (!hmac) return false;

  // Create a copy without hmac for verification
  const params = new URLSearchParams(query);
  params.delete("hmac");

  // Sort and stringify
  const sortedParams = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const hash = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET)
    .update(sortedParams)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac));
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const code = url.searchParams.get("code");

  if (!shop || !code) {
    return json({ error: "Missing shop or code parameter" }, { status: 400 });
  }

  // Verify HMAC
  if (!verifyHmac(url.searchParams)) {
    return json({ error: "Invalid HMAC" }, { status: 401 });
  }

  // Exchange code for access token
  const tokenResponse = await fetch(
    `https://${shop}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
      }),
    }
  );

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    return json({ error: `Token exchange failed: ${error}` }, { status: 500 });
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;

  // For single-store deployment, display the token to add to env vars
  // In production, you'd store this securely
  return json({
    success: true,
    message: "OAuth completed successfully!",
    instructions: "Add this access token to your Vercel environment variables as SHOPIFY_ACCESS_TOKEN",
    shop,
    access_token: accessToken,
    scopes: tokenData.scope,
  });
}

export default function AuthCallback() {
  return (
    <div style={{ padding: "40px", fontFamily: "system-ui" }}>
      <h1>Processing OAuth callback...</h1>
    </div>
  );
}
