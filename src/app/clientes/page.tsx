import { redirect } from "next/navigation";
import { getNeoPrincipal } from "@/lib/neo-auth";
import ClientesClient from "./ClientesClient";

export const instant = false;

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const principal = await getNeoPrincipal();
  if (!principal) redirect("/login");
  if (!principal.isOwner && !principal.permissions.includes("clients.view")) redirect("/");
  return <ClientesClient />;
}
