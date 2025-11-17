/// <reference types="@cloudflare/workers-types" />
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

export async function generateTOTP(secretBase32: string, forTime?: number, digits = 6) {
  const step = 30;
  const time = Math.floor((forTime ?? Date.now()) / 1000 / step);

  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(4, time);

  const key = base32ToBytes(secretBase32);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, msg));
  const offset = hmac[hmac.length - 1] & 0xf;

  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

// Base32 decode
function base32ToBytes(base32: string): Uint8Array<ArrayBuffer> {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32.replace(/=+$/, "")) {
    const val = alphabet.indexOf(char.toUpperCase());
    if (val < 0) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{8}/g)?.map(b => parseInt(b, 2)) ?? [];
  return new Uint8Array(bytes);
}

export async function verifyTOTP(userPIN: string, secret: string, window = 1) {
  const now = Date.now();
  const step = 30 * 1000;

  for (let w = -window; w <= window; w++) {
    const time = now + w * step;
    const expected = await generateTOTP(secret, time);
    if (userPIN === expected) return true;
  }

  return false;
}


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
