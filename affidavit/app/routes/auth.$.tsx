import type { LoaderFunctionArgs } from "@remix-run/node";
import shopify from "~/lib/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await shopify.authenticate.admin(request);
  return null;
}
