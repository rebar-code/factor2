import * as dotenv from "dotenv";

dotenv.config();

const SHOPIFY_STORE = process.env.SHOPIFY_STORE || "factor2inc.myshopify.com";
const SHOPIFY_CLI_TOKEN = process.env.SHOPIFY_CLI_TOKEN;
const API_VERSION = "2024-10";

const GET_PRODUCT_METAFIELD = `
  query GetProductMetafield($productId: ID!, $namespace: String!, $key: String!) {
    product(id: $productId) {
      id
      title
      handle
      metafield(namespace: $namespace, key: $key) {
        id
        namespace
        key
        value
        type
      }
    }
  }
`;

const SET_PRODUCT_METAFIELD = `
  mutation SetProductMetafield($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        value
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

async function checkAndSetMetafield(productId: string, namespace: string, key: string, value: any) {
  console.log(`\n🔍 Checking metafield ${namespace}.${key} on product ${productId}...`);

  // First, check current value
  const checkResult = await shopifyGraphQL(GET_PRODUCT_METAFIELD, {
    productId: `gid://shopify/Product/${productId}`,
    namespace,
    key,
  });

  if (checkResult.errors) {
    console.error("❌ GraphQL errors:", checkResult.errors);
    return false;
  }

  const product = checkResult.data?.product;
  if (!product) {
    console.error(`❌ Product ${productId} not found!`);
    return false;
  }

  console.log(`✅ Product found: ${product.title} (${product.handle})`);

  const existingMetafield = product.metafield;
  if (existingMetafield) {
    console.log(`📋 Current metafield value: ${existingMetafield.value || "(empty)"}`);
    if (existingMetafield.value === String(value)) {
      console.log(`✅ Metafield already set to ${value}. No update needed.`);
      return true;
    }
  } else {
    console.log(`📋 Metafield does not exist yet (will be created)`);
  }

  // Set the metafield value
  console.log(`\n🔄 Setting metafield ${namespace}.${key} to ${value}...`);

  const setResult = await shopifyGraphQL(SET_PRODUCT_METAFIELD, {
    metafields: [
      {
        ownerId: `gid://shopify/Product/${productId}`,
        namespace,
        key,
        value: String(value),
        type: key.includes("requires_affidavit") ? "boolean" : "single_line_text_field",
      },
    ],
  });

  if (setResult.data?.metafieldsSet?.userErrors?.length > 0) {
    console.error(
      `❌ Errors setting metafield:`,
      setResult.data.metafieldsSet.userErrors
    );
    return false;
  } else if (setResult.data?.metafieldsSet?.metafields?.length > 0) {
    const metafield = setResult.data.metafieldsSet.metafields[0];
    console.log(`✅ Successfully set ${namespace}.${key} = ${metafield.value}`);
    return true;
  } else {
    console.error(`❌ Unexpected response:`, setResult);
    return false;
  }
}

async function copyFromAffidavitNamespace(productId: string) {
  console.log(`\n📋 Checking if values exist in 'affidavit' namespace...`);
  
  // Check affidavit namespace first
  const affidavitCheck = await shopifyGraphQL(GET_PRODUCT_METAFIELD, {
    productId: `gid://shopify/Product/${productId}`,
    namespace: "affidavit",
    key: "requires_affidavit",
  });

  const affidavitValue = affidavitCheck.data?.product?.metafield?.value;
  
  if (affidavitValue) {
    console.log(`✅ Found value in affidavit namespace: ${affidavitValue}`);
    console.log(`   Copying to custom namespace...`);
    
    // Copy to custom namespace
    await checkAndSetMetafield(
      productId,
      "custom",
      "affidavit_requires_affidavit",
      affidavitValue === "true" || affidavitValue === true
    );
    
    // Check product codes too
    const codesCheck = await shopifyGraphQL(GET_PRODUCT_METAFIELD, {
      productId: `gid://shopify/Product/${productId}`,
      namespace: "affidavit",
      key: "product_codes",
    });
    
    const codesValue = codesCheck.data?.product?.metafield?.value;
    if (codesValue) {
      console.log(`✅ Found product codes in affidavit namespace: ${codesValue}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await checkAndSetMetafield(
        productId,
        "custom",
        "affidavit_product_codes",
        codesValue
      );
    }
    
    return true;
  }
  
  return false;
}

async function main() {
  console.log("Setting affidavit metafields on product...\n");

  if (!SHOPIFY_CLI_TOKEN) {
    console.error("❌ SHOPIFY_CLI_TOKEN environment variable is required");
    process.exit(1);
  }

  // Product ID from the debug output
  const productId = "8727588077766";

  // First, try to copy from affidavit namespace if values exist there
  const copied = await copyFromAffidavitNamespace(productId);
  
  if (!copied) {
    // If no values in affidavit namespace, set directly in custom namespace
    console.log(`\n📝 No values found in affidavit namespace, setting directly...`);
    await checkAndSetMetafield(
      productId,
      "custom",
      "affidavit_requires_affidavit",
      true
    );
  }

  console.log(`\n✅ Complete!`);
  console.log(`\n📝 Next steps:`);
  console.log(`   1. Refresh your product page`);
  console.log(`   2. The metafield value should now be visible`);
  console.log(`   3. The affidavit logic should work correctly`);
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});

