import { createClient } from "@supabase/supabase-js";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// For customer access (with RLS)
export function createCustomerSupabaseClient(customerId: string) {
  // In a real implementation, you'd generate a JWT for the customer
  // For now, we'll use the service role key but verify ownership server-side
  return supabase;
}

