import sgMail from "@sendgrid/mail";

if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY not set - email functionality will be disabled");
}

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export interface AffidavitSubmissionEmailData {
  customerName: string;
  customerEmail: string;
  productCodes: string[];
  submissionId: string;
  pdfUrl: string;
  approveUrl: string;
  rejectUrl: string;
}

export async function sendAffidavitSubmissionEmail(
  data: AffidavitSubmissionEmailData
): Promise<void> {
  if (!process.env.SENDGRID_API_KEY || !process.env.ADMIN_EMAIL) {
    console.log("Email not configured, skipping email send");
    console.log("Would send to:", process.env.ADMIN_EMAIL);
    console.log("Data:", data);
    return;
  }

  const msg = {
    to: process.env.ADMIN_EMAIL,
    from: process.env.ADMIN_EMAIL, // Change this to your verified sender
    subject: `New Affidavit Submission - ${data.customerName}`,
    html: `
      <h2>New Affidavit Submission</h2>
      <p><strong>Customer:</strong> ${data.customerName} (${data.customerEmail})</p>
      <p><strong>Product Codes:</strong> ${data.productCodes.join(", ")}</p>
      <p><strong>Submission ID:</strong> ${data.submissionId}</p>
      
      <p>
        <a href="${data.pdfUrl}" target="_blank" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin-right: 10px;">
          View PDF
        </a>
        <a href="${data.approveUrl}" style="display: inline-block; padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 5px; margin-right: 10px;">
          Approve
        </a>
        <a href="${data.rejectUrl}" style="display: inline-block; padding: 10px 20px; background: #dc3545; color: white; text-decoration: none; border-radius: 5px;">
          Reject
        </a>
      </p>
      
      <p><small>PDF link expires in 7 days</small></p>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log("Affidavit submission email sent successfully");
  } catch (error: any) {
    console.error("Error sending email:", error);
    if (error.response) {
      console.error("Error details:", error.response.body);
    }
    throw error;
  }
}

export async function sendAffidavitApprovalEmail(
  customerEmail: string,
  customerName: string,
  productCodes: string[]
): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log("Email not configured, skipping approval email");
    return;
  }

  const msg = {
    to: customerEmail,
    from: process.env.ADMIN_EMAIL!,
    subject: "Your Affidavit Has Been Approved",
    html: `
      <h2>Affidavit Approved</h2>
      <p>Dear ${customerName},</p>
      <p>Your affidavit for product code(s): <strong>${productCodes.join(", ")}</strong> has been approved.</p>
      <p>Your order will proceed as normal. This approval is valid for 365 days.</p>
      <p>Thank you!</p>
    `,
  };

  try {
    await sgMail.send(msg);
  } catch (error) {
    console.error("Error sending approval email:", error);
  }
}

export async function sendAffidavitRejectionEmail(
  customerEmail: string,
  customerName: string,
  productCodes: string[]
): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log("Email not configured, skipping rejection email");
    return;
  }

  const msg = {
    to: customerEmail,
    from: process.env.ADMIN_EMAIL!,
    subject: "Affidavit Submission Update",
    html: `
      <h2>Affidavit Not Approved</h2>
      <p>Dear ${customerName},</p>
      <p>Unfortunately, your affidavit for product code(s): <strong>${productCodes.join(", ")}</strong> was not approved.</p>
      <p>Your order has been cancelled. Please review the requirements and resubmit your affidavit if you wish to proceed.</p>
      <p>If you have questions, please contact us.</p>
    `,
  };

  try {
    await sgMail.send(msg);
  } catch (error) {
    console.error("Error sending rejection email:", error);
  }
}

