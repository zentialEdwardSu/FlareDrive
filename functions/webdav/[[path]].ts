import { notFound, parseBucketPath } from "./utils";
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
import { authenticator } from "@otplib/preset-v11";

async function handleRequestOptions() {
  return new Response(null, {
    headers: {
      Allow: Object.keys(HANDLERS).join(", "),
      DAV: "1",
    },
  });
}

async function handleMethodNotAllowed() {
  return new Response(null, { status: 405 });
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

export const onRequest: PagesFunction<{
  WEBDAV_USERNAME?: string;
  WEBDAV_PASSWORD?: string;
  WEBDAV_PUBLIC_READ?: string;
  WEBDAV_2FA_SECRET?: string;
  WEBDAV_2FA_WINDOW?: string;
}> = async function (context) {
  const env = context.env;
  const request: Request = context.request;
  if (request.method === "OPTIONS") return handleRequestOptions();

  const skipAuth =
    env.WEBDAV_PUBLIC_READ === "1" &&
    ["GET", "HEAD", "PROPFIND"].includes(request.method);

  if (!skipAuth) {
    const configuredUsername = env.WEBDAV_USERNAME;
    const configuredPassword = env.WEBDAV_PASSWORD;
    const twoFaSecret = env.WEBDAV_2FA_SECRET;
    const windowOverride = env.WEBDAV_2FA_WINDOW;

    const hasPasswordAuth = Boolean(configuredUsername && configuredPassword);
    const hasTwoFactorAuth = Boolean(twoFaSecret);

    if (!hasPasswordAuth && !hasTwoFactorAuth)
      return new Response("WebDAV protocol is not enabled", { status: 403 });

    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": `Basic realm="WebDAV"` },
      });
    }

    let decoded: string;
    try {
      decoded = atob(auth.slice("Basic ".length).trim());
    } catch (error) {
      return new Response("Unauthorized", { status: 401 });
    }

    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1)
      return new Response("Unauthorized", { status: 401 });

    const suppliedUsername = decoded.slice(0, separatorIndex);
    const suppliedSecret = decoded.slice(separatorIndex + 1);

    let isAuthorized = false;

    if (
      hasPasswordAuth &&
      suppliedUsername === configuredUsername &&
      suppliedSecret === configuredPassword
    ) {
      isAuthorized = true;
    }

    if (!isAuthorized && hasTwoFactorAuth) {
      authenticator.options = {window: parseInt(windowOverride as string)}
      const isValid2FA = authenticator.check(suppliedSecret,twoFaSecret as string);
      if (isValid2FA) isAuthorized = true;
    }

    if (!isAuthorized)
      return new Response("Unauthorized", { status: 401 });
  }

  const [bucket, path] = parseBucketPath(context);
  if (!bucket) return notFound();

  const method: string = (context.request as Request).method;
  const handler = HANDLERS[method] ?? handleMethodNotAllowed;
  return handler({ bucket, path, request: context.request });
};
