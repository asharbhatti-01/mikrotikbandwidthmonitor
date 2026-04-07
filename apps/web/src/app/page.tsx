import { redirect } from "next/navigation";
import { cookies } from "next/headers";

/**
 * Root page — check for an auth session cookie and redirect accordingly.
 * In a real implementation this would validate a JWT / session token server-side.
 */
export default async function RootPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session_token");

  if (sessionToken?.value) {
    redirect("/devices");
  }

  redirect("/login");
}
