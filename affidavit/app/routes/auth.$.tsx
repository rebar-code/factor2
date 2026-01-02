import { json } from "@remix-run/node";

export async function loader() {
  // Auth is handled via admin access token in env vars
  // This route is no longer needed for OAuth flow
  return json({ message: "Auth endpoint - using admin token from env" });
}
