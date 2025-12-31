import { json, type ActionFunctionArgs } from "@remix-run/node";
import { approveAffidavit } from "~/lib/metafields";
import { sendAffidavitApprovalEmail } from "~/lib/email.server";
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

    if (!submissionId || !customerId || !productCodesStr) {
      return json({ error: "Missing required parameters" }, { status: 400 });
    }

    const productCodes = productCodesStr.split(",").map((code) => code.trim());

    // Approve affidavit in customer metafield
    await approveAffidavit(customerId, productCodes, submissionId);

    // Update order metafield if order exists
    const orderId = formData.get("orderId") as string | null;
    if (orderId) {
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
              status: "approved",
              approved_at: new Date().toISOString(),
            }),
            type: "json",
          },
        },
      });

      // Release order hold if on hold
      const releaseHoldMutation = `
        mutation ReleaseOrderHold($id: ID!) {
          orderHoldRelease(id: $id) {
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
        await shopify.graphql(releaseHoldMutation, {
          variables: { id: `gid://shopify/Order/${orderId}` },
        });
      } catch (error) {
        // Order might not be on hold, ignore error
        console.log("Order hold release skipped:", error);
      }
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

    // Send approval email
    if (customer) {
      await sendAffidavitApprovalEmail(
        customer.email,
        `${customer.firstName} ${customer.lastName}`,
        productCodes
      );
    }

    return json({
      success: true,
      message: "Affidavit approved successfully",
    });
  } catch (error: any) {
    console.error("Error approving affidavit:", error);
    return json(
      { error: error.message || "Failed to approve affidavit" },
      { status: 500 }
    );
  }
}

