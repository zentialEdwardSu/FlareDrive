import { RequestHandlerParams } from "./utils";
import { getIndexedObject, upsertObject } from "../db";

async function handleRequestPutMultipart({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  const url = new URL(request.url);

  const uploadId = new URLSearchParams(url.search).get("uploadId");
  const partNumberStr = new URLSearchParams(url.search).get("partNumber");
  if (!uploadId || !partNumberStr || !request.body)
    return new Response("Bad Request", { status: 400 });
  const multipartUpload = bucket.resumeMultipartUpload(path, uploadId);

  const partNumber = parseInt(partNumberStr);
  const uploadedPart = await multipartUpload.uploadPart(
    partNumber,
    request.body
  );

  return new Response(null, {
    headers: { "Content-Type": "application/json", etag: uploadedPart.etag },
  });
}

export async function handleRequestPut(params: RequestHandlerParams) {
  const { bucket, db, driveId, path, request } = params;
  const searchParams = new URLSearchParams(new URL(request.url).search);
  if (searchParams.has("uploadId")) {
    return handleRequestPutMultipart(params);
  }

  if (request.url.endsWith("/")) {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Check if the parent directory exists
  if (!path.startsWith("_$flaredrive$/")) {
    const parentPath = path.replace(/(\/|^)[^/]*$/, "");
    if (parentPath !== "") {
      const parentDir = await getIndexedObject(db, driveId, parentPath);
      if (!parentDir?.isDirectory) return new Response("Conflict", { status: 409 });
    }
  }

  const thumbnail = request.headers.get("fd-thumbnail");
  const customMetadata = thumbnail ? { thumbnail } : undefined;

  const result = await bucket.put(path, request.body, {
    onlyIf: request.headers,
    httpMetadata: request.headers,
    customMetadata,
  });

  if (!result) return new Response("Preconditions failed", { status: 412 });
  await upsertObject(db, driveId, result);

  return new Response("", { status: 201 });
}
