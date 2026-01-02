import { adminGraphQL } from "./shopify.server";

export interface AffidavitFormData {
  name: string;
  company: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postal: string;
  country: string;
  telephone: string;
  email: string;
  productCodes: string;
  contactTissue: string;
  howForm: string;
  implanted: string;
  implantDays?: number;
  protocol: string;
  printName: string;
  signature: string; // base64 image data
  title: string;
  date: string;
}

export interface AffidavitSubmission {
  id: string;
  product_codes: string[];
  status: "approved" | "pending" | "rejected";
  submitted_at: string;
  approved_at?: string;
  expires_at?: string;
  form_data: AffidavitFormData;
}

// Legacy interface for backwards compatibility during migration
export interface AffidavitStatus {
  product_code: string;
  status: "approved" | "pending" | "rejected";
  approved_at?: string;
  expires_at?: string;
  submission_id: string;
  submitted_at: string;
}

// Get all submissions for a customer (new format with full form_data)
export async function getCustomerSubmissions(customerId: string): Promise<AffidavitSubmission[]> {
  const query = `
    query GetCustomerMetafield($id: ID!) {
      customer(id: $id) {
        id
        metafield(namespace: "app--factor2-affidavit", key: "submissions") {
          value
        }
      }
    }
  `;

  const data = await adminGraphQL(query, {
    id: `gid://shopify/Customer/${customerId}`,
  });

  const metafieldValue = data.data?.customer?.metafield?.value;

  if (!metafieldValue) {
    return [];
  }

  try {
    return JSON.parse(metafieldValue);
  } catch {
    return [];
  }
}

// Legacy function for backwards compatibility
export async function getCustomerAffidavits(customerId: string): Promise<AffidavitStatus[]> {
  const query = `
    query GetCustomerMetafield($id: ID!) {
      customer(id: $id) {
        id
        metafield(namespace: "app--factor2-affidavit", key: "approved_affidavits") {
          value
        }
      }
    }
  `;

  const data = await adminGraphQL(query, {
    id: `gid://shopify/Customer/${customerId}`,
  });

  const metafieldValue = data.data?.customer?.metafield?.value;

  if (!metafieldValue) {
    return [];
  }

  try {
    return JSON.parse(metafieldValue);
  } catch {
    return [];
  }
}

// Update submissions (new format with full form_data)
export async function updateCustomerSubmissions(
  customerId: string,
  submissions: AffidavitSubmission[]
): Promise<void> {
  const mutation = `
    mutation UpdateCustomerMetafield($input: [MetafieldsSetInput!]!) {
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

  const data = await adminGraphQL(mutation, {
    input: [{
      ownerId: `gid://shopify/Customer/${customerId}`,
      namespace: "app--factor2-affidavit",
      key: "submissions",
      value: JSON.stringify(submissions),
      type: "json",
    }],
  });

  if (data.data?.metafieldsSet?.userErrors?.length > 0) {
    throw new Error(
      `Failed to update metafield: ${JSON.stringify(data.data.metafieldsSet.userErrors)}`
    );
  }
}

// Legacy function
export async function updateCustomerAffidavits(
  customerId: string,
  affidavits: AffidavitStatus[]
): Promise<void> {
  const mutation = `
    mutation UpdateCustomerMetafield($input: [MetafieldsSetInput!]!) {
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

  const data = await adminGraphQL(mutation, {
    input: [{
      ownerId: `gid://shopify/Customer/${customerId}`,
      namespace: "app--factor2-affidavit",
      key: "approved_affidavits",
      value: JSON.stringify(affidavits),
      type: "json",
    }],
  });

  if (data.data?.metafieldsSet?.userErrors?.length > 0) {
    throw new Error(
      `Failed to update metafield: ${JSON.stringify(data.data.metafieldsSet.userErrors)}`
    );
  }
}

// Add a new submission with full form data
export async function addSubmission(
  customerId: string,
  submissionId: string,
  productCodes: string[],
  formData: AffidavitFormData
): Promise<void> {
  const existing = await getCustomerSubmissions(customerId);

  const now = new Date().toISOString();
  existing.push({
    id: submissionId,
    product_codes: productCodes,
    status: "pending",
    submitted_at: now,
    form_data: formData,
  });

  await updateCustomerSubmissions(customerId, existing);
}

// Legacy function - kept for backwards compatibility
export async function addPendingAffidavit(
  customerId: string,
  productCodes: string[],
  submissionId: string
): Promise<void> {
  const existing = await getCustomerAffidavits(customerId);

  // Add pending affidavit for each product code
  const now = new Date().toISOString();
  for (const code of productCodes) {
    existing.push({
      product_code: code,
      status: "pending",
      submission_id: submissionId,
      submitted_at: now,
    });
  }

  await updateCustomerAffidavits(customerId, existing);
}

export async function approveAffidavit(
  customerId: string,
  productCodes: string[],
  submissionId: string
): Promise<void> {
  const existing = await getCustomerAffidavits(customerId);
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 365); // 365 days from now

  const updated = existing.map((affidavit) => {
    if (
      affidavit.submission_id === submissionId &&
      productCodes.includes(affidavit.product_code) &&
      affidavit.status === "pending"
    ) {
      return {
        ...affidavit,
        status: "approved" as const,
        approved_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      };
    }
    return affidavit;
  });

  await updateCustomerAffidavits(customerId, updated);
}

export async function rejectAffidavit(
  customerId: string,
  productCodes: string[],
  submissionId: string
): Promise<void> {
  const existing = await getCustomerAffidavits(customerId);

  const updated = existing.map((affidavit) => {
    if (
      affidavit.submission_id === submissionId &&
      productCodes.includes(affidavit.product_code) &&
      affidavit.status === "pending"
    ) {
      return {
        ...affidavit,
        status: "rejected" as const,
      };
    }
    return affidavit;
  });

  await updateCustomerAffidavits(customerId, updated);
}

export function hasValidAffidavit(
  affidavits: AffidavitStatus[],
  productCode: string
): boolean {
  const now = new Date().getTime();

  return affidavits.some((affidavit) => {
    if (
      affidavit.product_code === productCode &&
      affidavit.status === "approved"
    ) {
      if (affidavit.expires_at) {
        const expiresAt = new Date(affidavit.expires_at).getTime();
        return expiresAt > now;
      }
      return true;
    }
    return false;
  });
}

// New submission-based functions

// Approve a submission by ID
export async function approveSubmission(
  customerId: string,
  submissionId: string
): Promise<AffidavitSubmission | null> {
  const submissions = await getCustomerSubmissions(customerId);
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 365); // 365 days from now

  let approvedSubmission: AffidavitSubmission | null = null;

  const updated = submissions.map((submission) => {
    if (submission.id === submissionId && submission.status === "pending") {
      approvedSubmission = {
        ...submission,
        status: "approved" as const,
        approved_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      };
      return approvedSubmission;
    }
    return submission;
  });

  await updateCustomerSubmissions(customerId, updated);
  return approvedSubmission;
}

// Reject a submission by ID
export async function rejectSubmission(
  customerId: string,
  submissionId: string
): Promise<AffidavitSubmission | null> {
  const submissions = await getCustomerSubmissions(customerId);

  let rejectedSubmission: AffidavitSubmission | null = null;

  const updated = submissions.map((submission) => {
    if (submission.id === submissionId && submission.status === "pending") {
      rejectedSubmission = {
        ...submission,
        status: "rejected" as const,
      };
      return rejectedSubmission;
    }
    return submission;
  });

  await updateCustomerSubmissions(customerId, updated);
  return rejectedSubmission;
}

// Get a specific submission by ID
export async function getSubmission(
  customerId: string,
  submissionId: string
): Promise<AffidavitSubmission | null> {
  const submissions = await getCustomerSubmissions(customerId);
  return submissions.find((s) => s.id === submissionId) || null;
}

// Check if customer has a valid (approved, non-expired) affidavit for given product codes
export function hasValidSubmission(
  submissions: AffidavitSubmission[],
  productCodes: string[]
): { valid: boolean; validFor: string[]; missing: string[] } {
  const now = new Date().getTime();
  const validFor: string[] = [];
  const missing: string[] = [];

  for (const code of productCodes) {
    const hasValid = submissions.some((submission) => {
      if (
        submission.product_codes.includes(code) &&
        submission.status === "approved"
      ) {
        if (submission.expires_at) {
          const expiresAt = new Date(submission.expires_at).getTime();
          return expiresAt > now;
        }
        return true;
      }
      return false;
    });

    if (hasValid) {
      validFor.push(code);
    } else {
      missing.push(code);
    }
  }

  return {
    valid: missing.length === 0,
    validFor,
    missing,
  };
}

// Check if customer has a pending submission for given product codes
export function hasPendingSubmission(
  submissions: AffidavitSubmission[],
  productCodes: string[]
): boolean {
  return submissions.some(
    (submission) =>
      submission.status === "pending" &&
      submission.product_codes.some((code) => productCodes.includes(code))
  );
}

