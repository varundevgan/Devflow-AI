import { createHmac, timingSafeEqual } from "node:crypto";

export const ACCESS_TOKEN_EXPIRE = 15 * 60 * 1000;

type AccessTokenHeader = {
  alg: "HS256";
  typ: "JWT";
};

type AccessTokenPayload = {
  sub: string;
  iat: number;
  exp: number;
};

function base64urlEncode(toEncode: string) {
  return Buffer.from(toEncode).toString("base64url");
}

export function generateAccessToken(userId: string, secret: string): string {
  const header: AccessTokenHeader = {
    alg: "HS256",
    typ: "JWT",
  };

  const now = Math.floor(Date.now() / 1000);

  const payload: AccessTokenPayload = {
    sub: userId,
    iat: now,
    exp: now + ACCESS_TOKEN_EXPIRE / 1000,
  };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));

  const signinInput = `${encodedHeader}.${encodedPayload}`;

  const signature = createHmac("sha256", secret).update(signinInput).digest("base64url");

  return `${signinInput}.${signature}`;
}

export function verifyAccessToken(token: string, secret: string): { userId: string } {
  const parts = token.split(".");
  const encodedHeader = parts[0];
  const encodedPayload = parts[1];
  const encodedSignature = parts[2];

  if (
    parts.length !== 3 ||
    encodedHeader === undefined ||
    encodedPayload === undefined ||
    encodedSignature === undefined ||
    encodedHeader.length === 0 ||
    encodedPayload.length === 0 ||
    encodedSignature.length === 0
  ) {
    throw new Error("Invalid access token");
  }

  // HMAC-SHA256 only. The header's alg is not consulted until the signature matches,
  // so a token cannot choose a weaker algorithm.
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = createHmac("sha256", secret).update(signingInput).digest();
  const actualSignature = Buffer.from(encodedSignature, "base64url");

  if (
    expectedSignature.length !== actualSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw new Error("Invalid access token");
  }

  const header = decodeJsonObject(encodedHeader);
  if (header === undefined || header.alg !== "HS256" || header.typ !== "JWT") {
    throw new Error("Invalid access token");
  }

  const payload = decodeJsonObject(encodedPayload);
  const sub = payload?.sub;
  const exp = payload?.exp;
  const now = Date.now() / 1000;
  if (typeof sub !== "string" || sub.length === 0) {
    throw new Error("Invalid access token");
  }
  if (typeof exp !== "number" || !Number.isFinite(exp) || exp <= now) {
    throw new Error("Invalid access token");
  }

  return { userId: sub };
}

function decodeJsonObject(encoded: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
