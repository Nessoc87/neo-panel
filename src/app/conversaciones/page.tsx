import { redirect } from "next/navigation";
import ConversationsInbox from "./ConversationsInbox";
import { connection } from "next/server";
import { getNeoPrincipal } from "@/lib/neo-auth";

export const instant = false;

export default async function ConversationsPage() {
  await connection();
  const principal = await getNeoPrincipal();
  if (!principal) redirect("/login");
  if (!principal.isOwner && !principal.permissions.includes("conversations.view")) redirect("/");
  return <ConversationsInbox />;
}