import pLimit from "p-limit";

import {
  getIndexedObject,
  listIndexedObjects,
  parentPath,
  upsertObject,
} from "../db";
import { handleRequestDelete } from "./delete";
import { notFound } from "./utils";
import { RequestHandlerParams, WEBDAV_ENDPOINT } from "./utils";

export async function handleRequestCopy({
  bucket,
  db,
  driveId,
  path,
  request,
}: RequestHandlerParams) {
  const dontOverwrite = request.headers.get("Overwrite") === "F";
  const destinationHeader = request.headers.get("Destination");
  if (destinationHeader === null)
    return new Response("Bad Request", { status: 400 });

  const src = await bucket.get(path);
  if (src === null) return notFound();

  const destPathname = new URL(destinationHeader).pathname;
  const decodedPathname = decodeURIComponent(destPathname).replace(/\/$/, "");
  if (!decodedPathname.startsWith(WEBDAV_ENDPOINT))
    return new Response("Bad Request", { status: 400 });
  const destination = decodedPathname.slice(WEBDAV_ENDPOINT.length);

  if (
    !destination ||
    destination === path ||
    path.startsWith(destination + "/") ||
    (src.httpMetadata?.contentType === "application/x-directory" &&
      destination.startsWith(path + "/"))
  )
    return new Response("Bad Request", { status: 400 });

  // Check if the destination already exists
  const destinationExists = await getIndexedObject(db, driveId, destination);
  if (dontOverwrite && destinationExists)
    return new Response("Precondition Failed", { status: 412 });
  const destinationParent = parentPath(destination);
  if (destinationParent) {
    const parent = await getIndexedObject(db, driveId, destinationParent);
    if (!parent?.isDirectory) return new Response("Conflict", { status: 409 });
  }
  if (destinationExists) {
    await handleRequestDelete({ bucket, db, driveId, path: destination, request });
  }
  const destinationObject = await bucket.put(destination, src.body, {
    httpMetadata: src.httpMetadata,
    customMetadata: src.customMetadata,
  });
  await upsertObject(db, driveId, destinationObject);

  const isDirectory =
    src.httpMetadata?.contentType === "application/x-directory";
  if (isDirectory) {
    const depth = request.headers.get("Depth") ?? "infinity";
    switch (depth) {
      case "0":
        break;
      case "infinity": {
        const prefix = path + "/";
        const children = await listIndexedObjects(db, driveId, path, true);
        const copy = async (object: (typeof children)[number]) => {
          const target = `${destination}/${object.path.slice(prefix.length)}`;
          const sourceObject = await bucket.get(object.path);
          if (sourceObject === null) return;
          const copiedObject = await bucket.put(target, sourceObject.body, {
            httpMetadata: sourceObject.httpMetadata,
            customMetadata: sourceObject.customMetadata,
          });
          await upsertObject(db, driveId, copiedObject);
        };
        const limit = pLimit(5);
        const promises = children.map((object) => limit(() => copy(object)));
        await Promise.all(promises);
        break;
      }
      default:
        return new Response("Bad Request", { status: 400 });
    }
  }

  if (destinationExists !== null) {
    return new Response(null, { status: 204 });
  } else {
    return new Response("", { status: 201 });
  }
}
