import { redirect } from "next/navigation";
import { getNeoPrincipal } from "@/lib/neo-auth";
import CotizacionesClient from "./CotizacionesClient";

export const instant = false;

export const dynamic = "force-dynamic";

export default async function CotizacionesPage() {
  const principal = await getNeoPrincipal();
  if (!principal) redirect("/login");
  if (!principal.isOwner && !principal.permissions.includes("quotes.view")) redirect("/");
  return <CotizacionesClient />;
}
