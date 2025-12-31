import { json, type ActionFunctionArgs } from "@remix-run/node";
import { randomUUID } from "crypto";
import { supabase } from "~/lib/supabase.server";
import { generateAffidavitPDF, type AffidavitFormData } from "~/lib/pdf.server";
import { addPendingAffidavit } from "~/lib/metafields";
import { sendAffidavitSubmissionEmail } from "~/lib/email.server";
import { shopify } from "~/lib/shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Get customer from session (you'll need to implement Shopify session handling)
    // For now, we'll get it from the request body
    const formData = await request.formData();
    const customerId = formData.get("customerId") as string;
    
    if (!customerId) {
      return json({ error: "Customer ID required" }, { status: 400 });
    }

    // Parse form data
    const affidavitData: AffidavitFormData = {
      name: formData.get("name") as string,
      company: formData.get("company") as string,
      address1: formData.get("address1") as string,
      address2: formData.get("address2") as string || undefined,
      city: formData.get("city") as string,
      state: formData.get("state") as string,
      postal: formData.get("postal") as string,
      country: formData.get("country") as string,
      telephone: formData.get("telephone") as string,
      email: formData.get("email") as string,
      productCodes: formData.get("productCodes") as string,
      contactTissue: formData.get("contactTissue") as string,
      howForm: formData.get("howForm") as string,
      implanted: formData.get("implanted") as string,
      implantDays: formData.get("implantDays") ? parseInt(formData.get("implantDays") as string) : undefined,
      protocol: formData.get("protocol") as string,
      printName: formData.get("printName") as string,
      signature: formData.get("signature") as string, // base64 image
      title: formData.get("title") as string,
      date: formData.get("date") as string,
    };

    // Validate required fields
    const requiredFields = [
      "name", "company", "address1", "city", "state", "postal", "country",
      "telephone", "email", "productCodes", "contactTissue", "howForm",
      "implanted", "protocol", "printName", "signature", "title", "date"
    ];

    for (const field of requiredFields) {
      if (!affidavitData[field as keyof AffidavitFormData]) {
        return json({ error: `Missing required field: ${field}` }, { status: 400 });
      }
    }

    if (affidavitData.implanted === "Yes" && !affidavitData.implantDays) {
      return json({ error: "Implant days required when implanted is Yes" }, { status: 400 });
    }

    // Generate PDF
    const pdfBuffer = generateAffidavitPDF(affidavitData);

    // Generate submission ID
    const submissionId = randomUUID();

    // Upload PDF to Supabase Storage
    const fileName = `${customerId}/${submissionId}/affidavit.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("affidavits")
      .upload(fileName, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading PDF:", uploadError);
      return json({ error: "Failed to upload PDF" }, { status: 500 });
    }

    // Handle attachments if present
    const attachmentFiles: string[] = [];
    const attachmentCount = parseInt(formData.get("attachmentCount") as string) || 0;
    for (let i = 0; i < attachmentCount; i++) {
      const attachment = formData.get(`attachment_${i}`) as File;
      if (attachment) {
        const attachmentBuffer = Buffer.from(await attachment.arrayBuffer());
        const attachmentFileName = `${customerId}/${submissionId}/attachment_${i + 1}.${attachment.name.split('.').pop()}`;
        const { error: attachError } = await supabase.storage
          .from("affidavits")
          .upload(attachmentFileName, attachmentBuffer, {
            contentType: attachment.type,
            upsert: false,
          });
        
        if (!attachError) {
          attachmentFiles.push(attachmentFileName);
        }
      }
    }

    // Parse product codes
    const productCodes = affidavitData.productCodes
      .split(",")
      .map((code) => code.trim())
      .filter(Boolean);

    // Update customer metafield
    await addPendingAffidavit(customerId, productCodes, submissionId);

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

    // Generate signed URL for PDF (7 days expiration for admin email)
    const { data: signedUrlData } = await supabase.storage
      .from("affidavits")
      .createSignedUrl(fileName, 60 * 60 * 24 * 7); // 7 days

    const pdfUrl = signedUrlData?.signedUrl || "";

    // Generate approve/reject URLs
    const baseUrl = process.env.SHOPIFY_APP_URL || "";
    const approveUrl = `${baseUrl}/api/orders/affidavit-approve?submissionId=${submissionId}&customerId=${customerId}`;
    const rejectUrl = `${baseUrl}/api/orders/affidavit-reject?submissionId=${submissionId}&customerId=${customerId}`;

    // Send email notification
    await sendAffidavitSubmissionEmail({
      customerName: customer ? `${customer.firstName} ${customer.lastName}` : affidavitData.name,
      customerEmail: customer?.email || affidavitData.email,
      productCodes,
      submissionId,
      pdfUrl,
      approveUrl,
      rejectUrl,
    });

    return json({
      success: true,
      submissionId,
      message: "Affidavit submitted successfully. Your submission is pending review.",
    });
  } catch (error: any) {
    console.error("Error submitting affidavit:", error);
    return json(
      { error: error.message || "Failed to submit affidavit" },
      { status: 500 }
    );
  }
}

