import * as dotenv from "dotenv";

dotenv.config();

const SHOPIFY_STORE = process.env.SHOPIFY_STORE || "factor2inc.myshopify.com";
const SHOPIFY_CLI_TOKEN = process.env.SHOPIFY_CLI_TOKEN;
const API_VERSION = "2024-10";

const CREATE_METAFIELD_DEFINITION = `
  mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        id
        name
        namespace
        key
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function shopifyGraphQL(query: string, variables: any = {}) {
  const url = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_CLI_TOKEN!,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await response.json();
  return json;
}

async function createMetafieldDefinition(definition: any) {
  const result = await shopifyGraphQL(CREATE_METAFIELD_DEFINITION, { definition });

  if (result.data?.metafieldDefinitionCreate?.userErrors?.length > 0) {
    const errors = result.data.metafieldDefinitionCreate.userErrors;
    // Check if it's a duplicate error (definition already exists)
    if (errors.some((e: any) => e.message?.includes("already exists"))) {
      console.log(`⚠️  Metafield ${definition.namespace}.${definition.key} already exists, skipping...`);
      return false;
    }
    console.error(`❌ Errors creating ${definition.namespace}.${definition.key}:`, errors);
    return false;
  } else if (result.data?.metafieldDefinitionCreate?.createdDefinition) {
    console.log(`✅ Created: ${definition.namespace}.${definition.key}`);
    return true;
  } else {
    console.error(`❌ Unexpected response for ${definition.namespace}.${definition.key}:`, result);
    return false;
  }
}

async function createAllMetafieldDefinitions() {
  console.log("Creating metafield definitions for Factor II Affidavit App...\n");

  if (!SHOPIFY_CLI_TOKEN) {
    console.error("❌ SHOPIFY_CLI_TOKEN environment variable is required");
    process.exit(1);
  }

  const definitions = [
    // Product metafields
    {
      name: "Requires Affidavit",
      namespace: "affidavit",
      key: "requires_affidavit",
      description: "Whether this product requires an affidavit",
      type: "boolean",
      ownerType: "PRODUCT",
    },
    {
      name: "Product Codes",
      namespace: "affidavit",
      key: "product_codes",
      description: "Factor II product codes for this product (comma-separated)",
      type: "list.single_line_text_field",
      ownerType: "PRODUCT",
    },
    // Customer metafields
    {
      name: "Approved Affidavits",
      namespace: "app--factor2-affidavit",
      key: "approved_affidavits",
      description: "Customer's affidavit approvals and statuses",
      type: "json",
      ownerType: "CUSTOMER",
    },
    // Order metafields
    {
      name: "Affidavit Submission",
      namespace: "app--factor2-affidavit",
      key: "affidavit_submission",
      description: "Affidavit submission reference for this order",
      type: "json",
      ownerType: "ORDER",
    },
  ];

  let created = 0;
  let skipped = 0;

  for (const definition of definitions) {
    const success = await createMetafieldDefinition(definition);
    if (success) {
      created++;
    } else {
      skipped++;
    }
    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`\n✅ Complete! Created: ${created}, Skipped: ${skipped}`);
}

createAllMetafieldDefinitions().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});

