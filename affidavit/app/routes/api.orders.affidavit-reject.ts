import { json, type ActionFunctionArgs } from "@remix-run/node";
import { rejectSubmission } from "~/lib/metafields";
import { adminGraphQL } from "~/lib/shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const submissionId = formData.get("submissionId") as string;
    const customerId = formData.get("customerId") as string;
    const reason = formData.get("reason") as string | null;

    if (!submissionId || !customerId) {
      return json({ error: "Missing required parameters" }, { status: 400 });
    }

    // Reject submission in customer metafield
    const rejectedSubmission = await rejectSubmission(customerId, submissionId);

    if (!rejectedSubmission) {
      return json({ error: "Submission not found or already processed" }, { status: 404 });
    }

    // Update order metafield and cancel order if order exists
    const orderId = formData.get("orderId") as string | null;
    if (orderId) {
      // Update order metafield
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
        input: [{
          ownerId: `gid://shopify/Order/${orderId}`,
          namespace: "app--factor2-affidavit",
          key: "affidavit_submission",
          value: JSON.stringify({
            submission_id: submissionId,
            product_codes: rejectedSubmission.product_codes,
            status: "rejected",
            rejected_at: new Date().toISOString(),
            reason: reason || null,
          }),
          type: "json",
        }],
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

      await adminGraphQL(cancelMutation, {
        id: `gid://shopify/Order/${orderId}`,
        reason: reason || "Affidavit rejected",
      });
    }

    return json({
      success: true,
      message: "Affidavit rejected",
      submission: {
        id: rejectedSubmission.id,
        product_codes: rejectedSubmission.product_codes,
      },
    });
  } catch (error: any) {
    console.error("Error rejecting affidavit:", error);
    return json(
      { error: error.message || "Failed to reject affidavit" },
      { status: 500 }
    );
  }
}
