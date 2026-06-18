import {
  applySafeObjectHeaders,
  applyValidatorHeaders,
  isValidationConditional,
  notFound,
  RequestHandlerParams,
} from "./utils";

export async function handleRequestGet({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  const obj = await bucket.get(path, {
    onlyIf: request.headers,
    range: request.headers,
  });
  if (obj === null) return notFound();

  // No body => a precondition failed. A validation conditional
  // (If-None-Match / If-Modified-Since) means the cached copy is fresh
  // (304); anything else is a hard precondition failure (412).
  if (!("body" in obj)) {
    if (isValidationConditional(request)) {
      const headers = new Headers();
      applyValidatorHeaders(headers, obj);
      return new Response(null, { status: 304, headers });
    }
    return new Response("Preconditions failed", { status: 412 });
  }

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  applyValidatorHeaders(headers, obj);
  headers.set("Accept-Ranges", "bytes");
  applySafeObjectHeaders(headers);
  if (path.startsWith("_$flaredrive$/thumbnails/"))
    headers.set("Cache-Control", "private, max-age=31536000, immutable");

  // A satisfied range request returns the partial slice.
  if (obj.range && request.headers.has("Range")) {
    const { offset = 0, length = obj.size } = obj.range as {
      offset?: number;
      length?: number;
    };
    const end = offset + length - 1;
    headers.set("Content-Range", `bytes ${offset}-${end}/${obj.size}`);
    return new Response(obj.body, { status: 206, headers });
  }

  return new Response(obj.body, { headers });
}
