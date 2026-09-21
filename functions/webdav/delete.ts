import { deleteIndexedTree, getIndexedObject, listIndexedObjects } from "../db";
import { notFound } from "./utils";
import { RequestHandlerParams } from "./utils";

export async function handleRequestDelete({
  bucket,
  db,
  driveId,
  path,
}: RequestHandlerParams) {
  let keys: string[];
  if (path !== "") {
    const obj = await getIndexedObject(db, driveId, path);
    if (obj === null) return notFound();
    keys = [path];
    if (obj.isDirectory) {
      const children = await listIndexedObjects(db, driveId, path, true);
      keys.push(...children.map((child) => child.path));
    }
  } else {
    const objects = await listIndexedObjects(db, driveId, "", true);
    keys = objects.map((object) => object.path);
  }

  for (let index = 0; index < keys.length; index += 1000) {
    await bucket.delete(keys.slice(index, index + 1000));
  }
  await deleteIndexedTree(db, driveId, path);

  return new Response(null, { status: 204 });
}
