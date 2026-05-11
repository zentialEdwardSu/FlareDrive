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
import { AuthEnv, hasValidSession } from "../auth/utils";

type WebDavEnv = AuthEnv & {
  WEBDAV_USERNAME?: string;
  WEBDAV_PASSWORD?: string;
  AUTH_SESSION_SECRET?: string;
  AUTH_SESSION_SECONDS?: string;
  WEBDAV_PUBLIC_READ?: string;
};

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

export const onRequest: PagesFunction<{
  WEBDAV_USERNAME?: string;
  WEBDAV_PASSWORD?: string;
  AUTH_SESSION_SECRET?: string;
  AUTH_SESSION_SECONDS?: string;
  WEBDAV_PUBLIC_READ?: string;
}> = async function (context) {
  const env = context.env as WebDavEnv;
  const request: Request = context.request;
  if (request.method === "OPTIONS") return handleRequestOptions();

  const [bucket, path] = parseBucketPath(context);

  const skipAuth =
    env.WEBDAV_PUBLIC_READ === "1" &&
    ["GET", "HEAD", "PROPFIND"].includes(request.method);

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

  if (!bucket) return notFound();

  const method: string = (context.request as Request).method;
  const handler = HANDLERS[method] ?? handleMethodNotAllowed;
  return handler({ bucket, path, request: context.request });
};
