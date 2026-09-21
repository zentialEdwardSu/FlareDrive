import { notFound } from "./utils";
import {
  RequestHandlerParams,
} from "./utils";
import { upsertObject } from "../db";

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
  db,
  driveId,
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
    await upsertObject(db, driveId, object);
    return new Response(null, {
      headers: { etag: object.httpEtag },
    });
  } catch (error: any) {
    return new Response(error.message, { status: 400 });
  }
}

export const handleRequestPost = async function (params: RequestHandlerParams) {
  const { request } = params;
  const url = new URL(request.url);
  const searchParams = new URLSearchParams(url.search);

  if (searchParams.has("uploads")) {
    return handleRequestPostCreateMultipart(params);
  }

  if (searchParams.has("uploadId")) {
    return handleRequestPostCompleteMultipart(params);
  }

  return new Response("Method not allowed", { status: 405 });
};
