import { json, type ActionFunctionArgs } from "@remix-run/node";
import { approveSubmission } from "~/lib/metafields";
import { adminGraphQL } from "~/lib/shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const submissionId = formData.get("submissionId") as string;
    const customerId = formData.get("customerId") as string;

    if (!submissionId || !customerId) {
      return json({ error: "Missing required parameters" }, { status: 400 });
    }

    // Approve submission in customer metafield
    const approvedSubmission = await approveSubmission(customerId, submissionId);

    if (!approvedSubmission) {
      return json({ error: "Submission not found or already processed" }, { status: 404 });
    }

    // Update order metafield if order exists
    const orderId = formData.get("orderId") as string | null;
    if (orderId) {
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
            product_codes: approvedSubmission.product_codes,
            status: "approved",
            approved_at: approvedSubmission.approved_at,
            expires_at: approvedSubmission.expires_at,
          }),
          type: "json",
        }],
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
        await adminGraphQL(releaseHoldMutation, {
          id: `gid://shopify/Order/${orderId}`,
        });
      } catch (error) {
        // Order might not be on hold, ignore error
        console.log("Order hold release skipped:", error);
      }
    }

    return json({
      success: true,
      message: "Affidavit approved successfully",
      submission: {
        id: approvedSubmission.id,
        product_codes: approvedSubmission.product_codes,
        approved_at: approvedSubmission.approved_at,
        expires_at: approvedSubmission.expires_at,
      },
    });
  } catch (error: any) {
    console.error("Error approving affidavit:", error);
    return json(
      { error: error.message || "Failed to approve affidavit" },
      { status: 500 }
    );
  }
}
