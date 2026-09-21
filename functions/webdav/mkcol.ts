import { RequestHandlerParams } from "./utils";
import { getIndexedObject, upsertObject } from "../db";

export async function handleRequestMkcol({
  bucket,
  db,
  driveId,
  path,
  request,
}: RequestHandlerParams) {
  // Check if the resource already exists
  const resource = await getIndexedObject(db, driveId, path);
  if (resource !== null) {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Check if the parent directory exists
  const parentPath = path.replace(/(\/|^)[^/]*$/, "");
  if (parentPath !== "") {
    const parentDir = await getIndexedObject(db, driveId, parentPath);
    if (!parentDir?.isDirectory) return new Response("Conflict", { status: 409 });
  }

  const object = await bucket.put(path, "", {
    httpMetadata: { contentType: "application/x-directory" },
  });
  await upsertObject(db, driveId, object);

  return new Response("Created", { status: 201 });
}
