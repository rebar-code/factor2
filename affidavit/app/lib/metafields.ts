import { shopify } from "./shopify.server";

export interface AffidavitStatus {
  product_code: string;
  status: "approved" | "pending" | "rejected";
  approved_at?: string;
  expires_at?: string;
  submission_id: string;
  submitted_at: string;
}

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

  const response = await shopify.graphql(query, {
    variables: { id: `gid://shopify/Customer/${customerId}` },
  });

  const data = await response.json();
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

export async function updateCustomerAffidavits(
  customerId: string,
  affidavits: AffidavitStatus[]
): Promise<void> {
  const mutation = `
    mutation UpdateCustomerMetafield($id: ID!, $metafield: MetafieldInput!) {
      metafieldsSet(metafields: [{ownerId: $id, ...$metafield}]) {
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

  const response = await shopify.graphql(mutation, {
    variables: {
      id: `gid://shopify/Customer/${customerId}`,
      metafield: {
        namespace: "app--factor2-affidavit",
        key: "approved_affidavits",
        value: JSON.stringify(affidavits),
        type: "json",
      },
    },
  });

  const data = await response.json();
  if (data.data?.metafieldsSet?.userErrors?.length > 0) {
    throw new Error(
      `Failed to update metafield: ${JSON.stringify(data.data.metafieldsSet.userErrors)}`
    );
  }
}

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

