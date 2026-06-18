import {
  applySafeObjectHeaders,
  applyValidatorHeaders,
  notFound,
  RequestHandlerParams,
} from "./utils";

function etagMatches(headerValue: string, etag: string | undefined) {
  if (!etag) return false;
  if (headerValue.trim() === "*") return true;
  const normalized = etag.replace(/^W\//, "").replace(/"/g, "");
  return headerValue
    .split(",")
    .map((tag) => tag.trim().replace(/^W\//, "").replace(/"/g, ""))
    .includes(normalized);
}

export async function handleRequestHead({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  const obj = await bucket.head(path);
  if (obj === null) return notFound();

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  applyValidatorHeaders(headers, obj);
  headers.set("Accept-Ranges", "bytes");
  applySafeObjectHeaders(headers);

  // Evaluate conditionals manually (R2 head() has no onlyIf support).
  const ifNoneMatch = request.headers.get("If-None-Match");
  const ifModifiedSince = request.headers.get("If-Modified-Since");
  if (ifNoneMatch !== null) {
    if (etagMatches(ifNoneMatch, obj.httpEtag))
      return new Response(null, { status: 304, headers });
  } else if (ifModifiedSince !== null) {
    const since = Date.parse(ifModifiedSince);
    if (!Number.isNaN(since) && obj.uploaded.getTime() <= since)
      return new Response(null, { status: 304, headers });
  }

  const ifMatch = request.headers.get("If-Match");
  const ifUnmodifiedSince = request.headers.get("If-Unmodified-Since");
  if (ifMatch !== null && !etagMatches(ifMatch, obj.httpEtag))
    return new Response(null, { status: 412, headers });
  if (ifUnmodifiedSince !== null) {
    const limit = Date.parse(ifUnmodifiedSince);
    if (!Number.isNaN(limit) && obj.uploaded.getTime() > limit)
      return new Response(null, { status: 412, headers });
  }

  return new Response(null, { headers });
}
