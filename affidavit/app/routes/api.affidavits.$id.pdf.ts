import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { supabase } from "~/lib/supabase.server";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const submissionId = params.id;
  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");

  if (!submissionId) {
    return json({ error: "Submission ID required" }, { status: 400 });
  }

  try {
    // Verify customer owns this submission or is admin
    // In production, verify Shopify session here
    const fileName = customerId 
      ? `${customerId}/${submissionId}/affidavit.pdf`
      : `**/${submissionId}/affidavit.pdf`; // Admin can access any

    // Generate signed URL (1 hour expiration)
    const { data, error } = await supabase.storage
      .from("affidavits")
      .createSignedUrl(fileName, 60 * 60); // 1 hour

    if (error || !data) {
      return json({ error: "Failed to generate PDF URL" }, { status: 500 });
    }

    // Redirect to signed URL
    return new Response(null, {
      status: 302,
      headers: {
        Location: data.signedUrl,
      },
    });
  } catch (error: any) {
    console.error("Error generating PDF URL:", error);
    return json({ error: "Failed to access PDF" }, { status: 500 });
  }
}

