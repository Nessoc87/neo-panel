import { redirect } from "next/navigation";
import { getNeoHomePath, getNeoPrincipal } from "@/lib/neo-auth";
import CotizacionesClient from "./CotizacionesClient";

export const instant = false;


export default async function CotizacionesPage() {
  const principal = await getNeoPrincipal();
  if (!principal) redirect("/login");
  if (!principal.isOwner && !principal.permissions.includes("quotes.view")) redirect(getNeoHomePath(principal));
  return <CotizacionesClient />;
}
