import { redirect } from "next/navigation";
import { getNeoPrincipal } from "@/lib/neo-auth";
import UsuariosClient from "./UsuariosClient";


export default async function UsuariosPage() {
  const principal = await getNeoPrincipal();
  if (!principal) redirect("/login");
  if (!principal.isOwner) redirect("/");
  return <UsuariosClient />;
}
