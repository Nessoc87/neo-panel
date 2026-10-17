import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "neo_session";

// La sesión permanece válida durante 30 días, incluso al cerrar la app.
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;

type SessionPayload = {
  username: string;
  expiresAt: number;
};

function getSessionSecret(): string {
  const secret = process.env.NEO_SESSION_SECRET;

  if (!secret) {
    throw new Error("Falta configurar NEO_SESSION_SECRET.");
  }

  return secret;
}

function secureCompare(first: string, second: string): boolean {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);

  if (firstBuffer.length !== secondBuffer.length) {
    return false;
  }

  return timingSafeEqual(firstBuffer, secondBuffer);
}

export function createSessionToken(username: string): string {
  const payload: SessionPayload = {
    username,
    expiresAt: Date.now() + SESSION_DURATION_SECONDS * 1000,
  };

  const encodedPayload = Buffer.from(
    JSON.stringify(payload)
  ).toString("base64url");

  const signature = createHmac("sha256", getSessionSecret())
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token?: string): boolean {
  try {
    if (!token) {
      return false;
    }

    const parts = token.split(".");

    if (parts.length !== 2) {
      return false;
    }

    const [encodedPayload, signature] = parts;

    const expectedSignature = createHmac(
      "sha256",
      getSessionSecret()
    )
      .update(encodedPayload)
      .digest("base64url");

    if (!secureCompare(signature, expectedSignature)) {
      return false;
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as Partial<SessionPayload>;

    return (
      typeof payload.username === "string" &&
      payload.username === process.env.NEO_ADMIN_USER &&
      typeof payload.expiresAt === "number" &&
      payload.expiresAt > Date.now()
    );
  } catch {
    return false;
  }
}
