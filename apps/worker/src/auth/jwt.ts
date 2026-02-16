/**
 * JWT utilities using Web Crypto API (HMAC-SHA256).
 * No external dependencies — runs on Cloudflare Workers, Deno, browsers, etc.
 */

export interface JWTPayload {
  sub: string; // userId (Google sub)
  name: string;
  email: string;
  picture?: string;
  exp: number; // Unix timestamp (seconds)
  iat: number; // Issued at (seconds)
}

const ALGORITHM = { name: "HMAC", hash: "SHA-256" };
const JWT_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

function base64UrlEncode(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  // Restore base64 padding
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeJSON(obj: unknown): string {
  const json = JSON.stringify(obj);
  return base64UrlEncode(new TextEncoder().encode(json));
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    ALGORITHM,
    false,
    ["sign", "verify"]
  );
}

/**
 * Create a signed JWT from a payload.
 */
export async function signJWT(
  payload: Omit<JWTPayload, "exp" | "iat">,
  secret: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + JWT_EXPIRY_SECONDS,
  };

  const header = encodeJSON({ alg: "HS256", typ: "JWT" });
  const body = encodeJSON(fullPayload);
  const signingInput = `${header}.${body}`;

  const key = await getKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput)
  );

  const sig = base64UrlEncode(new Uint8Array(signature));
  return `${signingInput}.${sig}`;
}

/**
 * Verify a JWT and return its payload, or null if invalid/expired.
 */
export async function verifyJWT(
  token: string,
  secret: string
): Promise<JWTPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts;
  const signingInput = `${header}.${body}`;

  try {
    const key = await getKey(secret);
    const signatureBytes = base64UrlDecode(sig);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      new TextEncoder().encode(signingInput)
    );

    if (!valid) return null;

    const payloadJson = new TextDecoder().decode(base64UrlDecode(body));
    const payload = JSON.parse(payloadJson) as JWTPayload;

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}
