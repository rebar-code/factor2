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
  console.log("Creating metafield definitions for products...\n");

  if (!SHOPIFY_CLI_TOKEN) {
    console.error("❌ SHOPIFY_CLI_TOKEN environment variable is required");
    process.exit(1);
  }

  const definitions = [
    {
      name: "Features",
      namespace: "custom",
      key: "features",
      description: "The features of the product.",
      type: "multi_line_text_field",
      ownerType: "PRODUCT",
    },
    {
        name: "Technical Specifications",
        namespace: "custom",
        key: "technical_specifications",
        description: "A JSON object containing the technical specifications.",
        type: "json",
        ownerType: "PRODUCT",
    },
    {
        name: "Datasheet",
        namespace: "custom",
        key: "datasheet",
        description: "A list of files for the product datasheets.",
        type: "list.file_reference",
        ownerType: "PRODUCT",
    },
    {
        name: "Extended Information",
        namespace: "custom",
        key: "extended_information",
        description: "The extended information for the product.",
        type: "multi_line_text_field",
        ownerType: "PRODUCT",
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
