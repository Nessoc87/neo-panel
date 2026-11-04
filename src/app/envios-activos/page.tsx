import { redirect } from "next/navigation";
import { getNeoHomePath, getNeoPrincipal } from "@/lib/neo-auth";
import EnviosClient from "./EnviosClient";

export const instant = false;

export const dynamic = "force-dynamic";

export default async function EnviosPage() {
  const principal = await getNeoPrincipal();
  if (!principal) redirect("/login");
  if (!principal.isOwner && !principal.permissions.includes("shipments.view")) redirect(getNeoHomePath(principal));
  return <EnviosClient />;
}
