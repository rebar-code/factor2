import * as dotenv from "dotenv";

dotenv.config();

const SHOPIFY_STORE = process.env.SHOPIFY_STORE || "factor2inc.myshopify.com";
const SHOPIFY_CLI_TOKEN = process.env.SHOPIFY_CLI_TOKEN;
const API_VERSION = "2024-10";

const LIST_ALL_PRODUCT_METAFIELDS = `
  query ListProductMetafieldDefinitions {
    metafieldDefinitions(first: 250, ownerType: PRODUCT) {
      edges {
        node {
          id
          name
          namespace
          key
          type {
            name
          }
          access {
            admin
            storefront
          }
        }
      }
    }
  }
`;

const GET_METAFIELD_DEFINITION = `
  query GetMetafieldDefinition($namespace: String!, $key: String!, $ownerType: MetafieldOwnerType!) {
    metafieldDefinitions(first: 1, namespace: $namespace, key: $key, ownerType: $ownerType) {
      edges {
        node {
          id
          name
          namespace
          key
          type {
            name
          }
          access {
            admin
            storefront
          }
        }
      }
    }
  }
`;

const UPDATE_METAFIELD_DEFINITION = `
  mutation UpdateMetafieldDefinition($id: ID!, $definition: MetafieldDefinitionInput!) {
    metafieldDefinitionUpdate(id: $id, definition: $definition) {
      metafieldDefinition {
        id
        name
        namespace
        key
        access {
          admin
          storefront
        }
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

async function updateMetafieldAccess(namespace: string, key: string, ownerType: string) {
  console.log(`\n🔍 Looking up metafield: ${namespace}.${key}...`);

  // First, get the existing definition
  const lookupResult = await shopifyGraphQL(GET_METAFIELD_DEFINITION, {
    namespace,
    key,
    ownerType,
  });

  if (
    lookupResult.data?.metafieldDefinitions?.edges?.length === 0
  ) {
    console.log(`❌ Metafield ${namespace}.${key} not found!`);
    return false;
  }

  const definition = lookupResult.data.metafieldDefinitions.edges[0].node;
  console.log(`✅ Found metafield definition:`);
  console.log(`   ID: ${definition.id}`);
  console.log(`   Current admin access: ${definition.access.admin}`);
  console.log(`   Current storefront access: ${definition.access.storefront}`);

  if (definition.access.storefront === "PUBLIC_READ") {
    console.log(`✅ Storefront access is already set to PUBLIC_READ. No update needed.`);
    return true;
  }

  // Update the definition with storefront access
  console.log(`\n🔄 Updating metafield definition to enable storefront access...`);

  const updateResult = await shopifyGraphQL(UPDATE_METAFIELD_DEFINITION, {
    id: definition.id,
    definition: {
      access: {
        admin: definition.access.admin || "MERCHANT_READ_WRITE",
        storefront: "PUBLIC_READ",
      },
    },
  });

  if (updateResult.data?.metafieldDefinitionUpdate?.userErrors?.length > 0) {
    console.error(
      `❌ Errors updating ${namespace}.${key}:`,
      updateResult.data.metafieldDefinitionUpdate.userErrors
    );
    return false;
  } else if (updateResult.data?.metafieldDefinitionUpdate?.metafieldDefinition) {
    const updated = updateResult.data.metafieldDefinitionUpdate.metafieldDefinition;
    console.log(`✅ Successfully updated: ${namespace}.${key}`);
    console.log(`   New storefront access: ${updated.access.storefront}`);
    return true;
  } else {
    console.error(`❌ Unexpected response:`, updateResult);
    return false;
  }
}

async function listAllProductMetafields() {
  console.log("📋 Listing all PRODUCT metafield definitions...\n");

  const result = await shopifyGraphQL(LIST_ALL_PRODUCT_METAFIELDS);

  if (result.errors) {
    console.error("❌ GraphQL errors:", result.errors);
    return;
  }

  const definitions = result.data?.metafieldDefinitions?.edges || [];

  if (definitions.length === 0) {
    console.log("❌ No product metafield definitions found!");
    return;
  }

  console.log(`✅ Found ${definitions.length} product metafield definition(s):\n`);

  definitions.forEach((edge: any, index: number) => {
    const def = edge.node;
    console.log(`${index + 1}. ${def.namespace}.${def.key}`);
    console.log(`   Name: ${def.name}`);
    console.log(`   Type: ${def.type.name}`);
    console.log(`   ID: ${def.id}`);
    console.log(`   Admin Access: ${def.access.admin}`);
    console.log(`   Storefront Access: ${def.access.storefront || "NOT SET"}`);
    console.log("");
  });

  // Check for affidavit metafields
  const affidavitMetafields = definitions.filter((edge: any) =>
    edge.node.namespace === "affidavit"
  );

  if (affidavitMetafields.length > 0) {
    console.log(`\n✅ Found ${affidavitMetafields.length} affidavit metafield(s):`);
    affidavitMetafields.forEach((edge: any) => {
      console.log(`   - ${edge.node.namespace}.${edge.node.key}`);
    });
  } else {
    console.log(`\n⚠️  No metafields found in 'affidavit' namespace`);
  }
}

async function updateAllAffidavitMetafields() {
  console.log("Updating affidavit metafield definitions to enable storefront access...\n");

  if (!SHOPIFY_CLI_TOKEN) {
    console.error("❌ SHOPIFY_CLI_TOKEN environment variable is required");
    process.exit(1);
  }

  // First, list all metafields to see what exists
  await listAllProductMetafields();
  console.log("\n" + "=".repeat(60) + "\n");

  // Check for metafields in BOTH namespaces
  // Note: The script earlier showed definitions exist in 'custom' namespace but NOT in 'affidavit' namespace
  // However, Shopify Admin shows values in 'affidavit' namespace, so we'll try both
  const metafields = [
    // affidavit namespace (what Shopify Admin shows - may not have definitions)
    {
      namespace: "affidavit",
      key: "requires_affidavit",
      ownerType: "PRODUCT",
    },
    {
      namespace: "affidavit",
      key: "product_codes",
      ownerType: "PRODUCT",
    },
    // custom namespace (definitions exist here with storefront access)
    {
      namespace: "custom",
      key: "affidavit_requires_affidavit",
      ownerType: "PRODUCT",
    },
    {
      namespace: "custom",
      key: "affidavit_product_codes",
      ownerType: "PRODUCT",
    },
  ];

  let updated = 0;
  let skipped = 0;

  for (const mf of metafields) {
    const success = await updateMetafieldAccess(mf.namespace, mf.key, mf.ownerType);
    if (success) {
      updated++;
    } else {
      skipped++;
    }
    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`\n✅ Complete! Updated: ${updated}, Skipped/Failed: ${skipped}`);
  console.log(`\n📝 Next steps:`);
  console.log(`   1. Refresh your product page`);
  console.log(`   2. Check if the metafield values are now visible`);
  console.log(`   3. If still not working, verify the metafield VALUE is set on the product in Shopify Admin`);
}

updateAllAffidavitMetafields().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});

