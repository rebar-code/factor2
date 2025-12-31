import { createClient } from "@shopify/shopify-app-remix";

export const shopify = createClient({
  apiKey: process.env.SHOPIFY_CLIENT_ID!,
  apiSecretKey: process.env.SHOPIFY_SECRET!,
  scopes: process.env.SHOPIFY_SCOPES?.split(",") || [],
  hostName: process.env.SHOPIFY_APP_URL?.replace(/https?:\/\//, "") || "",
  apiVersion: "2024-10",
});

