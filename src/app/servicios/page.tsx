import { redirect } from "next/navigation";
import { getNeoHomePath, getNeoPrincipal } from "@/lib/neo-auth";
import ServiciosClient from "./ServiciosClient";

export const instant = false;

export default async function ServiciosPage() {
  const principal = await getNeoPrincipal();
  if (!principal) redirect("/login");
  if (!principal.isOwner && !principal.permissions.includes("services.view")) redirect(getNeoHomePath(principal));
  return <ServiciosClient />;
}
