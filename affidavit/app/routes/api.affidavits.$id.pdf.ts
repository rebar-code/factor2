import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getSubmission } from "~/lib/metafields";
import { generateAffidavitPDF } from "~/lib/pdf.server";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const submissionId = params.id;
  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");

  if (!submissionId) {
    return json({ error: "Submission ID required" }, { status: 400 });
  }

  if (!customerId) {
    return json({ error: "Customer ID required" }, { status: 400 });
  }

  try {
    // Get submission from customer metafield
    const submission = await getSubmission(customerId, submissionId);

    if (!submission) {
      return json({ error: "Submission not found" }, { status: 404 });
    }

    // Generate PDF from stored form_data
    const pdfBuffer = generateAffidavitPDF(submission.form_data);

    // Return PDF as download
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="affidavit_${submissionId}.pdf"`,
        "Content-Length": pdfBuffer.byteLength.toString(),
      },
    });
  } catch (error: any) {
    console.error("Error generating PDF:", error);
    return json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
