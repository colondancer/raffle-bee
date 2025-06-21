import { redirect } from "@remix-run/node";

export const loader = async ({ request }) => {
  // Redirect to dashboard
  return redirect("/app/dashboard");
};