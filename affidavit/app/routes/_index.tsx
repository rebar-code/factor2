import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import shopify from "~/lib/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // If Shopify is redirecting here with auth params, handle the OAuth flow
  if (url.searchParams.get("shop")) {
    // Redirect to auth to complete OAuth
    return redirect(`/auth?${url.searchParams.toString()}`);
  }

  // Try to authenticate if we have a session
  try {
    await shopify.authenticate.admin(request);
    // If authenticated, redirect to admin dashboard
    return redirect("/admin");
  } catch {
    // Not authenticated, show landing page
    return null;
  }
}

export default function Index() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8", padding: "40px" }}>
      <h1>Factor II Affidavit App</h1>
      <p>This app manages affidavit compliance for Factor II products.</p>
      <p>
        <a href="/admin">Go to Admin Dashboard</a>
      </p>
    </div>
  );
}

