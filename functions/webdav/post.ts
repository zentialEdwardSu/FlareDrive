import { notFound } from "./utils";
import {
  isDirectoryObject,
  isInternalPath,
  randomShareToken,
  RequestHandlerParams,
} from "./utils";

export async function handleRequestPostCreateMultipart({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  const thumbnail = request.headers.get("fd-thumbnail");
  const customMetadata = thumbnail ? { thumbnail } : undefined;

  const multipartUpload = await bucket.createMultipartUpload(path, {
    httpMetadata: request.headers,
    customMetadata,
  });

  const { key, uploadId } = multipartUpload;
  return new Response(JSON.stringify({ key, uploadId }));
}

export async function handleRequestPostCompleteMultipart({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  const url = new URL(request.url);
  const uploadId = new URLSearchParams(url.search).get("uploadId");
  if (!uploadId) return notFound();
  const multipartUpload = bucket.resumeMultipartUpload(path, uploadId);

  const completeBody: { parts: Array<any> } = await request.json();

  try {
    const object = await multipartUpload.complete(completeBody.parts);
    return new Response(null, {
      headers: { etag: object.httpEtag },
    });
  } catch (error: any) {
    return new Response(error.message, { status: 400 });
  }
}

async function handleRequestPostCreateShare({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  if (isInternalPath(path)) return new Response("Forbidden", { status: 403 });

  const object = await bucket.get(path);
  if (object === null) return notFound();
  if (isDirectoryObject(object)) {
    return new Response("Cannot share folders", { status: 400 });
  }

  const token = object.customMetadata?.shareToken ?? randomShareToken();
  await bucket.put(path, object.body, {
    httpMetadata: object.httpMetadata,
    customMetadata: {
      ...object.customMetadata,
      shareToken: token,
    },
  });

  const url = new URL(request.url);
  url.search = "";
  url.searchParams.set("share", token);
  return new Response(JSON.stringify({ url: url.toString(), token }), {
    headers: { "Content-Type": "application/json" },
  });
}

export const handleRequestPost = async function ({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  const url = new URL(request.url);
  const searchParams = new URLSearchParams(url.search);

  if (searchParams.has("uploads")) {
    return handleRequestPostCreateMultipart({ bucket, path, request });
  }

  if (searchParams.has("uploadId")) {
    return handleRequestPostCompleteMultipart({ bucket, path, request });
  }

  if (searchParams.has("share")) {
    return handleRequestPostCreateShare({ bucket, path, request });
  }

  return new Response("Method not allowed", { status: 405 });
};
