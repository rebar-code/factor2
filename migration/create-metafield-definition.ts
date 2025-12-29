import * as dotenv from 'dotenv';

dotenv.config();

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_CLI_TOKEN = process.env.SHOPIFY_CLI_TOKEN;
const API_VERSION = '2024-10';

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
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_CLI_TOKEN!,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await response.json();
  return json;
}

async function createMetafieldDefinition() {
  console.log('Creating metafield definition for Volusion product code...\n');

  const definition = {
    name: 'Volusion Product Code',
    namespace: 'custom',
    key: 'volusion_product_code',
    description: 'Original product code from Volusion store',
    type: 'single_line_text_field',
    ownerType: 'PRODUCT',
  };

  const result = await shopifyGraphQL(CREATE_METAFIELD_DEFINITION, { definition });

  if (result.data?.metafieldDefinitionCreate?.userErrors?.length > 0) {
    console.error('❌ Errors:', result.data.metafieldDefinitionCreate.userErrors);
  } else if (result.data?.metafieldDefinitionCreate?.createdDefinition) {
    console.log('✅ Metafield definition created successfully!');
    console.log(result.data.metafieldDefinitionCreate.createdDefinition);
  } else {
    console.error('❌ Unexpected response:', result);
  }
}

createMetafieldDefinition();
