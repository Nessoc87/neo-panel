import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import CotizacionesClient from "./CotizacionesClient";

export const instant = false;

export default async function CotizacionesPage() {
  const store = await cookies();
  if (!verifySessionToken(store.get(SESSION_COOKIE_NAME)?.value)) redirect("/login");
  return <CotizacionesClient />;
}
