import { json, type ActionFunctionArgs } from "@remix-run/node";
import { rejectAffidavit } from "~/lib/metafields";
import { sendAffidavitRejectionEmail } from "~/lib/email.server";
import { shopify } from "~/lib/shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const submissionId = formData.get("submissionId") as string;
    const customerId = formData.get("customerId") as string;
    const productCodesStr = formData.get("productCodes") as string;
    const reason = formData.get("reason") as string | null;

    if (!submissionId || !customerId || !productCodesStr) {
      return json({ error: "Missing required parameters" }, { status: 400 });
    }

    const productCodes = productCodesStr.split(",").map((code) => code.trim());

    // Reject affidavit in customer metafield
    await rejectAffidavit(customerId, productCodes, submissionId);

    // Update order metafield and cancel order if order exists
    const orderId = formData.get("orderId") as string | null;
    if (orderId) {
      // Update order metafield
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
          id: `gid://shopify/Order/${orderId}`,
          metafield: {
            namespace: "app--factor2-affidavit",
            key: "affidavit_submission",
            value: JSON.stringify({
              submission_id: submissionId,
              product_codes: productCodes,
              status: "rejected",
              rejected_at: new Date().toISOString(),
              reason: reason || null,
            }),
            type: "json",
          },
        },
      });

      // Cancel the order
      const cancelMutation = `
        mutation CancelOrder($id: ID!, $reason: String) {
          orderCancel(id: $id, reason: $reason) {
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

      await shopify.graphql(cancelMutation, {
        variables: {
          id: `gid://shopify/Order/${orderId}`,
          reason: reason || "Affidavit rejected",
        },
      });
    }

    // Get customer info for email
    const customerQuery = `
      query GetCustomer($id: ID!) {
        customer(id: $id) {
          id
          firstName
          lastName
          email
        }
      }
    `;

    const customerResponse = await shopify.graphql(customerQuery, {
      variables: { id: `gid://shopify/Customer/${customerId}` },
    });
    const customerData = await customerResponse.json();
    const customer = customerData.data?.customer;

    // Send rejection email
    if (customer) {
      await sendAffidavitRejectionEmail(
        customer.email,
        `${customer.firstName} ${customer.lastName}`,
        productCodes
      );
    }

    return json({
      success: true,
      message: "Affidavit rejected and order cancelled",
    });
  } catch (error: any) {
    console.error("Error rejecting affidavit:", error);
    return json(
      { error: error.message || "Failed to reject affidavit" },
      { status: 500 }
    );
  }
}

