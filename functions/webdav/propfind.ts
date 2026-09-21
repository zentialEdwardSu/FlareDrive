import { getIndexedObject, IndexedObject, listIndexedObjects } from "../db";
import { escapeXml, RequestHandlerParams, WEBDAV_ENDPOINT } from "./utils";

function properties(object: IndexedObject | null) {
  if (!object) {
    const now = new Date().toUTCString();
    return {
      creationdate: now, displayname: undefined, getcontentlanguage: undefined,
      getcontentlength: "0", getcontenttype: "application/x-directory",
      getetag: undefined, getlastmodified: now, resourcetype: "<collection />",
      "fd:thumbnail": undefined,
    };
  }
  const uploaded = new Date(object.uploadedAt).toUTCString();
  return {
    creationdate: uploaded,
    displayname: object.contentDisposition ?? undefined,
    getcontentlanguage: object.contentLanguage ?? undefined,
    getcontentlength: object.size.toString(),
    getcontenttype: object.contentType ?? undefined,
    getetag: object.etag,
    getlastmodified: uploaded,
    resourcetype: object.isDirectory ? "<collection />" : "",
    "fd:thumbnail": object.thumbnail ?? undefined,
  };
}

function normalizeDepth(rawDepth: string | null) {
  const value = (rawDepth ?? "infinity").trim().toLowerCase();
  if (value === "0" || value === "1") return value;
  return "infinity";
}

export async function handleRequestPropfind({ db, driveId, path, request }: RequestHandlerParams) {
  const normalizedPath = path.replace(/\/+$/, "");
  const root = normalizedPath === "" ? null : await getIndexedObject(db, driveId, normalizedPath);
  if (normalizedPath && !root) return new Response("Not found", { status: 404 });
  if (path !== normalizedPath && root && !root.isDirectory) return new Response("Not found", { status: 404 });
  const depth = normalizeDepth(request.headers.get("Depth"));
  const children = depth === "0" || (root && !root.isDirectory)
    ? []
    : await listIndexedObjects(db, driveId, normalizedPath, depth === "infinity");
  const items = [{ path: normalizedPath, object: root }, ...children.map((object) => ({ path: object.path, object }))]
    .map(({ path: itemPath, object }) => {
      const values = properties(object);
      return `
  <response>
    <href>${escapeXml(encodeURI(`${WEBDAV_ENDPOINT}${itemPath}`))}</href>
    <propstat>
      <prop>
        ${Object.entries(values).filter(([_, value]) => value !== undefined)
          .map(([key, value]) => key === "resourcetype"
            ? `<${key}>${value}</${key}>`
            : `<${key}>${escapeXml(value ?? "")}</${key}>`).join("\n")}
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>`;
    });
  const xml = `<?xml version="1.0" encoding="utf-8" ?>
<multistatus xmlns="DAV:" xmlns:fd="flaredrive">${items.join("")}
</multistatus>`;
  return new Response(xml, { status: 207, headers: { "Content-Type": "application/xml" } });
}
