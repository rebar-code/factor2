import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { randomUUID } from "crypto";
import { addSubmission, type AffidavitFormData } from "~/lib/metafields";

export async function loader({ request }: LoaderFunctionArgs) {
  // Handle CORS preflight and GET requests
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  
  return json({ error: "Method not allowed. Use POST to submit an affidavit." }, { 
    status: 405,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  // Handle CORS for storefront requests
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
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
      address2: (formData.get("address2") as string) || undefined,
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
      implantDays: formData.get("implantDays")
        ? parseInt(formData.get("implantDays") as string)
        : undefined,
      protocol: formData.get("protocol") as string,
      printName: formData.get("printName") as string,
      signature: formData.get("signature") as string, // base64 image
      title: formData.get("title") as string,
      date: formData.get("date") as string,
    };

    // Validate required fields
    const requiredFields = [
      "name",
      "company",
      "address1",
      "city",
      "state",
      "postal",
      "country",
      "telephone",
      "email",
      "productCodes",
      "contactTissue",
      "howForm",
      "implanted",
      "protocol",
      "printName",
      "signature",
      "title",
      "date",
    ];

    for (const field of requiredFields) {
      if (!affidavitData[field as keyof AffidavitFormData]) {
        return json({ error: `Missing required field: ${field}` }, { status: 400 });
      }
    }

    if (affidavitData.implanted === "Yes" && !affidavitData.implantDays) {
      return json(
        { error: "Implant days required when implanted is Yes" },
        { status: 400 }
      );
    }

    // Generate submission ID
    const submissionId = randomUUID();

    // Parse product codes
    const productCodes = affidavitData.productCodes
      .split(",")
      .map((code) => code.trim())
      .filter(Boolean);

    // Save submission to customer metafield (includes full form_data)
    await addSubmission(customerId, submissionId, productCodes, affidavitData);

    return json(
      {
        success: true,
        submissionId,
        message:
          "Affidavit submitted successfully. Your submission is pending review.",
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
        },
      }
    );
  } catch (error: any) {
    console.error("Error submitting affidavit:", error);
    return json(
      { error: error.message || "Failed to submit affidavit" },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
        },
      }
    );
  }
}
