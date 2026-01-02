import { json, type ActionFunctionArgs } from "@remix-run/node";
import { adminGraphQL } from "~/lib/shopify.server";
import { getCustomerSubmissions, hasPendingSubmission } from "~/lib/metafields";

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

    // Check if order contains restricted products and collect their product codes
    const restrictedProductCodes: string[] = [];
    const productIds = order.line_items
      .map((item: any) => item.product_id?.toString().split("/").pop())
      .filter(Boolean);

    // Check each product for affidavit requirement
    for (const productId of productIds) {
      const productQuery = `
        query GetProduct($id: ID!) {
          product(id: $id) {
            id
            requiresAffidavit: metafield(namespace: "affidavit", key: "requires_affidavit") {
              value
            }
            productCodes: metafield(namespace: "affidavit", key: "product_codes") {
              value
            }
          }
        }
      `;

      const productData = await adminGraphQL(productQuery, {
        id: `gid://shopify/Product/${productId}`,
      });
      const product = productData.data?.product;

      if (product?.requiresAffidavit?.value === "true" && product?.productCodes?.value) {
        const codes = product.productCodes.value
          .split(",")
          .map((c: string) => c.trim())
          .filter(Boolean);
        restrictedProductCodes.push(...codes);
      }
    }

    if (restrictedProductCodes.length === 0) {
      return json({ success: true }); // No restricted products
    }

    // Get customer submissions
    const submissions = await getCustomerSubmissions(customerId);

    // Check if customer has pending submissions for these product codes
    const hasPending = hasPendingSubmission(submissions, restrictedProductCodes);

    if (hasPending) {
      // Find the pending submission
      const pendingSubmission = submissions.find(
        (s) =>
          s.status === "pending" &&
          s.product_codes.some((code) => restrictedProductCodes.includes(code))
      );

      if (pendingSubmission) {
        // Store submission reference in order metafield
        const mutation = `
          mutation UpdateOrderMetafield($input: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $input) {
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

        await adminGraphQL(mutation, {
          input: [
            {
              ownerId: `gid://shopify/Order/${order.id}`,
              namespace: "app--factor2-affidavit",
              key: "affidavit_submission",
              value: JSON.stringify({
                submission_id: pendingSubmission.id,
                customer_id: customerId,
                product_codes: pendingSubmission.product_codes,
                status: "pending",
                submitted_at: pendingSubmission.submitted_at,
              }),
              type: "json",
            },
          ],
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
          await adminGraphQL(holdMutation, {
            id: `gid://shopify/Order/${order.id}`,
            reason: "Pending affidavit approval",
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
