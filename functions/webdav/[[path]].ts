import {
  hasValidTOTPHeader,
  isDirectoryObject,
  isInternalPath,
  isSensitivePath,
  notFound,
  parseBucketPath,
  WEBDAV_METHODS,
} from "./utils";
import { handleRequestCopy } from "./copy";
import { handleRequestDelete } from "./delete";
import { handleRequestGet } from "./get";
import { handleRequestHead } from "./head";
import { handleRequestMkcol } from "./mkcol";
import { handleRequestMove } from "./move";
import { handleRequestPropfind } from "./propfind";
import { handleRequestPut } from "./put";
import { RequestHandlerParams } from "./utils";
import { handleRequestPost } from "./post";
import { AuthEnv, hasValidSession } from "../auth/utils";

type WebDavEnv = AuthEnv & {
  WEBDAV_USERNAME?: string;
  WEBDAV_PASSWORD?: string;
  AUTH_SESSION_SECRET?: string;
  AUTH_SESSION_SECONDS?: string;
  WEBDAV_2FA_SECRET?: string;
  WEBDAV_2FA_WINDOW?: string;
};

async function handleRequestOptions() {
  return new Response(null, {
    headers: {
      Allow: WEBDAV_METHODS.join(", "),
      DAV: "1, 2",
    },
  });
}

async function handleMethodNotAllowed() {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: WEBDAV_METHODS.join(", ") },
  });
}

function unauthorized(request: Request) {
  const headers =
    request.headers.get("X-FlareDrive-Web-Auth") === "1"
      ? undefined
      : { "WWW-Authenticate": `Basic realm="WebDAV"` };
  return new Response("Unauthorized", {
    status: 401,
    headers,
  });
}

const HANDLERS: Record<
  string,
  (context: RequestHandlerParams) => Promise<Response>
> = {
  PROPFIND: handleRequestPropfind,
  MKCOL: handleRequestMkcol,
  HEAD: handleRequestHead,
  GET: handleRequestGet,
  POST: handleRequestPost,
  PUT: handleRequestPut,
  COPY: handleRequestCopy,
  MOVE: handleRequestMove,
  DELETE: handleRequestDelete,
};

async function hasValidShareToken(bucket: R2Bucket, path: string, request: Request) {
  if (isInternalPath(path)) return false;
  if (!["GET", "HEAD"].includes(request.method)) return false;

  const token = new URL(request.url).searchParams.get("share");
  if (!token) return false;

  const object = await bucket.head(path);
  return Boolean(
    object &&
      !isDirectoryObject(object) &&
      object.customMetadata?.shareToken &&
      object.customMetadata.shareToken === token
  );
}

export const onRequest: PagesFunction<{
  WEBDAV_USERNAME?: string;
  WEBDAV_PASSWORD?: string;
  AUTH_SESSION_SECRET?: string;
  AUTH_SESSION_SECONDS?: string;
  WEBDAV_2FA_SECRET?: string;
  WEBDAV_2FA_WINDOW?: string;
}> = async function (context) {
  const env = context.env as WebDavEnv;
  const request: Request = context.request;
  if (request.method === "OPTIONS") return handleRequestOptions();

  const [bucket, path] = parseBucketPath(context);
  if (!bucket) return notFound();

  const skipAuth = await hasValidShareToken(bucket, path, request);

  if (!skipAuth) {
    const configuredUsername = env.WEBDAV_USERNAME;
    const configuredPassword = env.WEBDAV_PASSWORD;
    const hasPasswordAuth = Boolean(configuredUsername && configuredPassword);

    if (!hasPasswordAuth)
      return new Response("WebDAV protocol is not enabled", { status: 403 });

    if (!(await hasValidSession(request, env))) {
      const auth = request.headers.get("Authorization");
      if (!auth || !auth.startsWith("Basic ")) return unauthorized(request);

      let decoded: string;
      try {
        decoded = atob(auth.slice("Basic ".length).trim());
      } catch (error) {
        return unauthorized(request);
      }

      const separatorIndex = decoded.indexOf(":");
      if (separatorIndex === -1) return unauthorized(request);

      const suppliedUsername = decoded.slice(0, separatorIndex);
      const suppliedSecret = decoded.slice(separatorIndex + 1);

      if (
        suppliedUsername !== configuredUsername ||
        suppliedSecret !== configuredPassword
      ) {
        return unauthorized(request);
      }
    }
  }

  const method: string = (context.request as Request).method;
  if (
    ["DELETE", "MOVE"].includes(method) &&
    isSensitivePath(path) &&
    !(await hasValidTOTPHeader(request, env))
  ) {
    return new Response("TOTP required", { status: 403 });
  }

  const handler = HANDLERS[method] ?? handleMethodNotAllowed;
  return handler({ bucket, path, request: context.request });
};
