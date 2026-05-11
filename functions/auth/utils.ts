/// <reference types="@cloudflare/workers-types" />

const SESSION_COOKIE = "fd_session";
const DEFAULT_SESSION_SECONDS = 30 * 24 * 60 * 60;

export type AuthEnv = {
  AUTH_SESSION_SECRET?: string;
  AUTH_SESSION_SECONDS?: string;
  WEBDAV_USERNAME?: string;
  WEBDAV_PASSWORD?: string;
  WEBDAV_2FA_SECRET?: string;
  WEBDAV_2FA_WINDOW?: string;
  WEBDAV_TOTP_DIRECT_LOGIN?: string;
  BUCKET?: R2Bucket;
  [key: string]: unknown;
};

export type Session = {
  sub: string;
  exp: number;
};

export function getAuthBucket(context: {
  request: Request;
  env: AuthEnv;
}): R2Bucket | undefined {
  const url = new URL(context.request.url);
  const driveId = url.hostname.replace(/\..*/, "");
  return (context.env[driveId] as R2Bucket | undefined) ?? context.env.BUCKET;
}

export function parseIntegerEnv(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function sessionSeconds(env: AuthEnv) {
  return parseIntegerEnv(env.AUTH_SESSION_SECONDS, DEFAULT_SESSION_SECONDS);
}

export function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function base64UrlEncode(input: ArrayBuffer | Uint8Array | string) {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
      ? input
      : new Uint8Array(input);
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function sha256(input: string | Uint8Array) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  return base64UrlEncode(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function sessionSecret(env: AuthEnv) {
  return env.AUTH_SESSION_SECRET ?? env.WEBDAV_PASSWORD ?? env.WEBDAV_2FA_SECRET ?? "";
}

export async function createSessionCookie(env: AuthEnv, subject: string) {
  const maxAge = sessionSeconds(env);
  const payload = base64UrlEncode(
    JSON.stringify({ sub: subject, exp: Date.now() + maxAge * 1000 } satisfies Session)
  );
  const signature = await hmac(sessionSecret(env), payload);
  return [
    `${SESSION_COOKIE}=${payload}.${signature}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("Cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function readSession(request: Request, env: AuthEnv) {
  const value = readCookie(request, SESSION_COOKIE);
  if (!value) return null;

  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  if ((await hmac(sessionSecret(env), payload)) !== signature) return null;

  try {
    const session = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as Session;
    return session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export async function hasValidSession(request: Request, env: AuthEnv) {
  return Boolean(await readSession(request, env));
}
