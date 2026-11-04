import { connection } from "next/server";
import AcceptInviteClient from "./AcceptInviteClient";


export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  await connection();
  const params = await searchParams;
  return <AcceptInviteClient tokenHash={params.token_hash ?? ""} type={params.type ?? ""} />;
}
