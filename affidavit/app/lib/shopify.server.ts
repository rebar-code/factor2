// Simple Shopify API client without the full app SDK
// This avoids bundling issues with @shopify/shopify-app-remix

const API_VERSION = "2024-10";

export const apiVersion = API_VERSION;

// Simple GraphQL helper using access token from env
export async function adminGraphQL(
  query: string,
  variables?: Record<string, any>
) {
  const shop = process.env.SHOPIFY_STORE;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!shop || !accessToken) {
    throw new Error("SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN environment variables are required");
  }

  const response = await fetch(
    `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
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

// Export a default object for backward compatibility
export default {
  adminGraphQL,
};
