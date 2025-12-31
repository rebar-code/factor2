import { json, type ActionFunctionArgs } from "@remix-run/node";
import { shopify } from "~/lib/shopify.server";
import { getCustomerAffidavits } from "~/lib/metafields";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const webhook = await request.json();
    const order = webhook;

    if (!order.customer || !order.line_items) {
      return json({ success: true }); // Not a customer order or no line items
    }

    const customerId = order.customer.id?.toString().split("/").pop();
    if (!customerId) {
      return json({ success: true });
    }

    // Check if order contains restricted products
    const restrictedProducts: string[] = [];
    const productIds = order.line_items
      .map((item: any) => item.product_id?.toString().split("/").pop())
      .filter(Boolean);

    // Check each product for affidavit requirement
    for (const productId of productIds) {
      const productQuery = `
        query GetProduct($id: ID!) {
          product(id: $id) {
            id
            metafield(namespace: "affidavit", key: "requires_affidavit") {
              value
            }
            metafield(namespace: "affidavit", key: "product_codes") {
              value
            }
          }
        }
      `;

      const productResponse = await shopify.graphql(productQuery, {
        variables: { id: `gid://shopify/Product/${productId}` },
      });
      const productData = await productResponse.json();
      const product = productData.data?.product;

      if (product?.metafield?.value === "true") {
        restrictedProducts.push(productId);
      }
    }

    if (restrictedProducts.length === 0) {
      return json({ success: true }); // No restricted products
    }

    // Get customer affidavits
    const affidavits = await getCustomerAffidavits(customerId);

    // Check if customer has pending affidavits for these products
    const hasPendingAffidavit = affidavits.some(
      (affidavit) => affidavit.status === "pending"
    );

    if (hasPendingAffidavit) {
      // Store affidavit reference in order metafield
      const pendingAffidavit = affidavits.find(
        (affidavit) => affidavit.status === "pending"
      );

      if (pendingAffidavit) {
        const mutation = `
          mutation UpdateOrderMetafield($id: ID!, $metafield: MetafieldInput!) {
            metafieldsSet(metafields: [{ownerId: $id, ...$metafield}]) {
              metafields {
                id
                value
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        await shopify.graphql(mutation, {
          variables: {
            id: `gid://shopify/Order/${order.id}`,
            metafield: {
              namespace: "app--factor2-affidavit",
              key: "affidavit_submission",
              value: JSON.stringify({
                submission_id: pendingAffidavit.submission_id,
                product_codes: [pendingAffidavit.product_code],
                status: "pending",
                submitted_at: pendingAffidavit.submitted_at,
              }),
              type: "json",
            },
          },
        });

        // Put order on hold
        const holdMutation = `
          mutation HoldOrder($id: ID!, $reason: String!) {
            orderHold(id: $id, reason: $reason) {
              order {
                id
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        try {
          await shopify.graphql(holdMutation, {
            variables: {
              id: `gid://shopify/Order/${order.id}`,
              reason: "Pending affidavit approval",
            },
          });
        } catch (error) {
          console.log("Order hold skipped:", error);
        }
      }
    }

    return json({ success: true });
  } catch (error: any) {
    console.error("Error processing order webhook:", error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
}

