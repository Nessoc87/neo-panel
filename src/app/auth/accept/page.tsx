import AcceptInviteClient from "./AcceptInviteClient";

export const dynamic = "force-dynamic";

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const params = await searchParams;
  return <AcceptInviteClient tokenHash={params.token_hash ?? ""} type={params.type ?? ""} />;
}
