import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth";
import ConversationsInbox from "./ConversationsInbox";
import { connection } from "next/server";

export const instant = false;

export default async function ConversationsPage() {
  await connection();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!verifySessionToken(token)) {
    redirect("/login");
  }

  return <ConversationsInbox />;
}