/// <reference types="@cloudflare/workers-types" />

import { authenticator, totp } from "otplib";
import { KeyEncodings } from "@otplib/core";
import { createDigest } from "@otplib/plugin-crypto-js";

export interface RequestHandlerParams {
  bucket: R2Bucket;
  path: string;
  request: Request;
}

export const WEBDAV_ENDPOINT = "/webdav/";

export const ROOT_OBJECT = {
  key: "",
  uploaded: new Date(),
  httpMetadata: {
    contentType: "application/x-directory",
    contentDisposition: undefined,
    contentLanguage: undefined,
  },
  customMetadata: undefined,
  size: 0,
  etag: undefined,
};

export function notFound() {
  return new Response("Not found", { status: 404 });
}

export function parseBucketPath(context: any): [R2Bucket, string] {
  const { request, env, params } = context;
  const url = new URL(request.url);

  const pathSegments = (params.path || []) as String[];
  const path = decodeURIComponent(pathSegments.join("/"));
  const driveid = url.hostname.replace(/\..*/, "");

  return [env[driveid] || env["BUCKET"], path];
}

function normalizeWindow(windowSize: number): [number, number] {
  if (!Number.isFinite(windowSize)) return [0, 0];
  if (windowSize <= 1) return [0, 0];
  const total = Math.min(15, Math.floor(windowSize));
  const past = Math.floor(total / 2);
  const future = Math.max(0, total - past - 1);
  return [past, future];
}

function sanitizeToken(token: string, digits: number): string | null {
  const raw = token.replace(/\s+/g, "").trim();
  if (!/^[0-9]+$/.test(raw)) return null;
  if (raw.length > digits) return null;
  return raw.padStart(digits, "0");
}

export async function verifyTwoFactorPin(
  secret: string,
  token: string,
  windowSize: number = 1,
  periodSeconds: number = 30,
  digits: number = 6
): Promise<boolean> {
  if (!secret) return false;
  const normalizedSecret = secret.trim();
  const sanitized = sanitizeToken(token, digits);
  if (!sanitized) return false;

  const [past, future] = normalizeWindow(windowSize);
  const sharedOptions = {
    createDigest,
    digits,
    step: Math.max(5, Math.floor(periodSeconds)),
    window: [past, future] as [number, number],
  };

  try {
    const totpAuthenticator = authenticator.clone();
    totpAuthenticator.options = {
      ...totpAuthenticator.options,
      ...sharedOptions,
    };
    if (totpAuthenticator.check(sanitized, normalizedSecret)) return true;
  } catch (error) {
    // Fall through to plain TOTP verification when secret is not valid Base32.
  }

  try {
    const plainTotp = totp.clone();
    plainTotp.options = {
      ...plainTotp.options,
      ...sharedOptions,
      encoding: KeyEncodings.UTF8,
    };
    if (plainTotp.check(sanitized, normalizedSecret)) return true;
  } catch (error) {
    // Ignore fallback errors.
  }

  return false;
}

export async function* listAll(
  bucket: R2Bucket,
  prefix?: string,
  isRecursive: boolean = false
) {
  let cursor: string | undefined = undefined;
  let truncated = false;

  do {
    const r2Objects = await bucket.list({
      prefix: prefix,
      delimiter: isRecursive ? undefined : "/",
      cursor: cursor,
      // @ts-ignore
      include: ["httpMetadata", "customMetadata"],
    });

    for await (const obj of r2Objects.objects)
      if (!obj.key.startsWith("_$flaredrive$/")) yield obj;

    truncated = r2Objects.truncated;
    cursor = truncated ? (r2Objects as any).cursor : undefined;
  } while (truncated);
}
