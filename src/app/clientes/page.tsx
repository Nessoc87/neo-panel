import { redirect } from "next/navigation";
import { getNeoHomePath, getNeoPrincipal } from "@/lib/neo-auth";
import ClientesClient from "./ClientesClient";

export const instant = false;


export default async function ClientesPage() {
  const principal = await getNeoPrincipal();
  if (!principal) redirect("/login");
  if (!principal.isOwner && !principal.permissions.includes("clients.view")) redirect(getNeoHomePath(principal));
  return <ClientesClient />;
}
