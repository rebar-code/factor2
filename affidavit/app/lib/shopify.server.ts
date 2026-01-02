import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { MemorySessionStorage } from "@shopify/shopify-app-session-storage-memory";

// Session storage - for production, use a persistent storage like Redis or Prisma
const sessionStorage = new MemorySessionStorage();

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_CLIENT_ID!,
  apiSecretKey: process.env.SHOPIFY_SECRET!,
  apiVersion: ApiVersion.October24,
  scopes: process.env.SHOPIFY_SCOPES?.split(",") || [
    "read_customers",
    "write_customers",
    "read_products",
    "read_orders",
    "write_orders",
  ],
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage,
  distribution: AppDistribution.SingleMerchant,
  isEmbeddedApp: false,
  future: {
    unstable_newEmbeddedAuthStrategy: false,
  },
});

export default shopify;
export const apiVersion = ApiVersion.October24;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;

// Helper to make GraphQL calls using offline session
// For API endpoints called from storefront (without OAuth context)
export async function adminGraphQL(
  query: string,
  variables?: Record<string, any>
) {
  const shop = process.env.SHOPIFY_STORE!;

  // Get offline session for the shop
  const sessionId = `offline_${shop}`;
  const session = await sessionStorage.loadSession(sessionId);

  if (!session?.accessToken) {
    throw new Error(
      `No offline session found for ${shop}. Please install the app first by visiting /auth?shop=${shop}`
    );
  }

  const response = await fetch(
    `https://${shop}/admin/api/${ApiVersion.October24}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${text}`);
  }

  return response.json();
}
