import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSearchParams, Form, useNavigation } from "@remix-run/react";
import {
  getCustomerSubmissions,
  approveSubmission,
  rejectSubmission,
  type AffidavitSubmission,
} from "~/lib/metafields";
import { adminGraphQL } from "~/lib/shopify.server";

interface CustomerInfo {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface LoaderData {
  customerId: string | null;
  customer: CustomerInfo | null;
  submissions: AffidavitSubmission[];
  error: string | null;
}

export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");

  if (!customerId) {
    return json<LoaderData>({
      customerId: null,
      customer: null,
      submissions: [],
      error: null,
    });
  }

  try {
    // Get customer info
    const customerQuery = `
      query GetCustomer($id: ID!) {
        customer(id: $id) {
          id
          email
          firstName
          lastName
        }
      }
    `;

    const customerData = await adminGraphQL(customerQuery, {
      id: `gid://shopify/Customer/${customerId}`,
    });
    const customer = customerData.data?.customer;

    if (!customer) {
      return json<LoaderData>({
        customerId,
        customer: null,
        submissions: [],
        error: "Customer not found",
      });
    }

    // Get submissions
    const submissions = await getCustomerSubmissions(customerId);

    return json<LoaderData>({
      customerId,
      customer: {
        id: customerId,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
      },
      submissions,
      error: null,
    });
  } catch (error: any) {
    return json<LoaderData>({
      customerId,
      customer: null,
      submissions: [],
      error: error.message || "Failed to load customer data",
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const submissionId = formData.get("submissionId") as string;
  const customerId = formData.get("customerId") as string;

  if (!submissionId || !customerId) {
    return json({ error: "Missing required parameters" }, { status: 400 });
  }

  try {
    if (intent === "approve") {
      await approveSubmission(customerId, submissionId);
      return json({ success: true, message: "Submission approved" });
    } else if (intent === "reject") {
      await rejectSubmission(customerId, submissionId);
      return json({ success: true, message: "Submission rejected" });
    }

    return json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    return json({ error: error.message || "Action failed" }, { status: 500 });
  }
}

export default function AdminDashboard() {
  const { customerId, customer, submissions, error } = useLoaderData<LoaderData>();
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  const pendingSubmissions = submissions.filter((s) => s.status === "pending");
  const approvedSubmissions = submissions.filter((s) => s.status === "approved");
  const rejectedSubmissions = submissions.filter((s) => s.status === "rejected");

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>Factor II Affidavit Admin</h1>

      {/* Search Form */}
      <Form method="get" style={{ marginBottom: "30px" }}>
        <label style={{ display: "block", marginBottom: "10px", fontWeight: "bold" }}>
          Customer ID:
        </label>
        <div style={{ display: "flex", gap: "10px" }}>
          <input
            type="text"
            name="customerId"
            defaultValue={customerId || ""}
            placeholder="Enter Shopify Customer ID"
            style={{ padding: "8px", fontSize: "16px", flex: 1, maxWidth: "300px" }}
          />
          <button
            type="submit"
            style={{ padding: "8px 16px", fontSize: "16px", cursor: "pointer" }}
            disabled={isLoading}
          >
            {isLoading ? "Loading..." : "Search"}
          </button>
        </div>
      </Form>

      {error && (
        <div style={{ color: "red", padding: "10px", background: "#fee", marginBottom: "20px" }}>
          {error}
        </div>
      )}

      {customer && (
        <div>
          <h2>
            Customer: {customer.firstName} {customer.lastName}
          </h2>
          <p>Email: {customer.email}</p>
          <p>ID: {customer.id}</p>

          {/* Pending Submissions */}
          <h3 style={{ marginTop: "30px", color: "#e67e00" }}>
            Pending Submissions ({pendingSubmissions.length})
          </h3>
          {pendingSubmissions.length === 0 ? (
            <p>No pending submissions</p>
          ) : (
            pendingSubmissions.map((submission) => (
              <SubmissionCard
                key={submission.id}
                submission={submission}
                customerId={customer.id}
              />
            ))
          )}

          {/* Approved Submissions */}
          <h3 style={{ marginTop: "30px", color: "#28a745" }}>
            Approved Submissions ({approvedSubmissions.length})
          </h3>
          {approvedSubmissions.length === 0 ? (
            <p>No approved submissions</p>
          ) : (
            approvedSubmissions.map((submission) => (
              <SubmissionCard
                key={submission.id}
                submission={submission}
                customerId={customer.id}
                readonly
              />
            ))
          )}

          {/* Rejected Submissions */}
          <h3 style={{ marginTop: "30px", color: "#dc3545" }}>
            Rejected Submissions ({rejectedSubmissions.length})
          </h3>
          {rejectedSubmissions.length === 0 ? (
            <p>No rejected submissions</p>
          ) : (
            rejectedSubmissions.map((submission) => (
              <SubmissionCard
                key={submission.id}
                submission={submission}
                customerId={customer.id}
                readonly
              />
            ))
          )}
        </div>
      )}

      {!customer && !error && customerId && (
        <p>Loading customer data...</p>
      )}

      {!customerId && (
        <div style={{ color: "#666" }}>
          <p>Enter a Customer ID to view their affidavit submissions.</p>
          <p>You can find the Customer ID in Shopify admin under Customers, or from the order details.</p>
        </div>
      )}
    </div>
  );
}

function SubmissionCard({
  submission,
  customerId,
  readonly = false,
}: {
  submission: AffidavitSubmission;
  customerId: string;
  readonly?: boolean;
}) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const statusColors = {
    pending: "#e67e00",
    approved: "#28a745",
    rejected: "#dc3545",
  };

  return (
    <div
      style={{
        border: "1px solid #ccc",
        borderRadius: "8px",
        padding: "15px",
        marginBottom: "15px",
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p>
            <strong>Submission ID:</strong> {submission.id}
          </p>
          <p>
            <strong>Product Codes:</strong> {submission.product_codes.join(", ")}
          </p>
          <p>
            <strong>Status:</strong>{" "}
            <span style={{ color: statusColors[submission.status], fontWeight: "bold" }}>
              {submission.status.toUpperCase()}
            </span>
          </p>
          <p>
            <strong>Submitted:</strong> {new Date(submission.submitted_at).toLocaleString()}
          </p>
          {submission.approved_at && (
            <p>
              <strong>Approved:</strong> {new Date(submission.approved_at).toLocaleString()}
            </p>
          )}
          {submission.expires_at && (
            <p>
              <strong>Expires:</strong> {new Date(submission.expires_at).toLocaleString()}
            </p>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <a
            href={`/api/affidavits/${submission.id}/pdf?customerId=${customerId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "8px 16px",
              background: "#007bff",
              color: "white",
              textDecoration: "none",
              borderRadius: "4px",
              textAlign: "center",
            }}
          >
            View PDF
          </a>

          {!readonly && submission.status === "pending" && (
            <>
              <Form method="post" style={{ display: "inline" }}>
                <input type="hidden" name="submissionId" value={submission.id} />
                <input type="hidden" name="customerId" value={customerId} />
                <button
                  type="submit"
                  name="intent"
                  value="approve"
                  disabled={isSubmitting}
                  style={{
                    padding: "8px 16px",
                    background: "#28a745",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  {isSubmitting ? "..." : "Approve"}
                </button>
              </Form>
              <Form method="post" style={{ display: "inline" }}>
                <input type="hidden" name="submissionId" value={submission.id} />
                <input type="hidden" name="customerId" value={customerId} />
                <button
                  type="submit"
                  name="intent"
                  value="reject"
                  disabled={isSubmitting}
                  style={{
                    padding: "8px 16px",
                    background: "#dc3545",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  {isSubmitting ? "..." : "Reject"}
                </button>
              </Form>
            </>
          )}
        </div>
      </div>

      {/* Expandable form data */}
      <details style={{ marginTop: "15px" }}>
        <summary style={{ cursor: "pointer", fontWeight: "bold" }}>View Form Data</summary>
        <div style={{ marginTop: "10px", padding: "10px", background: "#f5f5f5", borderRadius: "4px" }}>
          <p><strong>Name:</strong> {submission.form_data.name}</p>
          <p><strong>Company:</strong> {submission.form_data.company}</p>
          <p><strong>Address:</strong> {submission.form_data.address1}{submission.form_data.address2 ? `, ${submission.form_data.address2}` : ""}</p>
          <p><strong>City/State/Postal:</strong> {submission.form_data.city}, {submission.form_data.state} {submission.form_data.postal}</p>
          <p><strong>Country:</strong> {submission.form_data.country}</p>
          <p><strong>Phone:</strong> {submission.form_data.telephone}</p>
          <p><strong>Email:</strong> {submission.form_data.email}</p>
          <hr />
          <p><strong>Contact with tissue externally:</strong> {submission.form_data.contactTissue}</p>
          <p><strong>Form (Cured/Uncured):</strong> {submission.form_data.howForm}</p>
          <p><strong>Will be implanted:</strong> {submission.form_data.implanted}</p>
          {submission.form_data.implanted === "Yes" && (
            <p><strong>Implant duration (days):</strong> {submission.form_data.implantDays}</p>
          )}
          <p><strong>Protocol:</strong> {submission.form_data.protocol}</p>
          <hr />
          <p><strong>Signed by:</strong> {submission.form_data.printName}</p>
          <p><strong>Title:</strong> {submission.form_data.title}</p>
          <p><strong>Date:</strong> {submission.form_data.date}</p>
          {submission.form_data.signature && (
            <div>
              <p><strong>Signature:</strong></p>
              <img
                src={submission.form_data.signature}
                alt="Signature"
                style={{ maxWidth: "300px", border: "1px solid #ccc" }}
              />
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
