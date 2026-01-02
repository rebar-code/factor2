import { json, type LoaderFunctionArgs } from "@remix-run/node";
import {
  getCustomerSubmissions,
  hasValidSubmission,
  hasPendingSubmission,
} from "~/lib/metafields";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");
  const productCodesParam = url.searchParams.get("productCodes");

  if (!customerId) {
    return json({ error: "Customer ID required" }, { status: 400 });
  }

  if (!productCodesParam) {
    return json({ error: "Product codes required" }, { status: 400 });
  }

  try {
    const productCodes = productCodesParam
      .split(",")
      .map((code) => code.trim())
      .filter(Boolean);

    // Get all customer submissions
    const submissions = await getCustomerSubmissions(customerId);

    // Check for valid (approved, non-expired) submissions
    const validationResult = hasValidSubmission(submissions, productCodes);

    // Check for pending submissions
    const hasPending = hasPendingSubmission(submissions, productCodes);

    return json({
      success: true,
      customerId,
      productCodes,
      hasValidAffidavit: validationResult.valid,
      validFor: validationResult.validFor,
      missing: validationResult.missing,
      hasPending,
    });
  } catch (error: any) {
    console.error("Error checking affidavit:", error);
    return json(
      { error: error.message || "Failed to check affidavit status" },
      { status: 500 }
    );
  }
}
