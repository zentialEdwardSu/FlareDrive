import {
  escapeXml,
  isDirectoryObject,
  listAll,
  RequestHandlerParams,
  ROOT_OBJECT,
  WEBDAV_ENDPOINT,
} from "./utils";

type DavProperties = {
  creationdate: string | undefined;
  displayname: string | undefined;
  getcontentlanguage: string | undefined;
  getcontentlength: string | undefined;
  getcontenttype: string | undefined;
  getetag: string | undefined;
  getlastmodified: string | undefined;
  resourcetype: string;
  "fd:thumbnail": string | undefined;
};

function fromR2Object(object: R2Object | typeof ROOT_OBJECT): DavProperties {
  return {
    creationdate: object.uploaded.toUTCString(),
    displayname: object.httpMetadata?.contentDisposition,
    getcontentlanguage: object.httpMetadata?.contentLanguage,
    getcontentlength: object.size.toString(),
    getcontenttype: object.httpMetadata?.contentType,
    getetag: object.etag,
    getlastmodified: object.uploaded.toUTCString(),
    resourcetype: isDirectoryObject(object) ? "<collection />" : "",
    "fd:thumbnail": object.customMetadata?.thumbnail,
  };
}

async function findChildren({
  bucket,
  path,
  depth,
}: {
  bucket: R2Bucket;
  path: string;
  depth: string;
}) {
  // depth "1" => immediate children (ResourceAndChildren),
  // "infinity" => full subtree (ResourceAndAncestors).
  if (!["1", "infinity"].includes(depth)) return [];

  const objects: Array<R2Object> = [];

  const prefix = path === "" ? path : `${path}/`;
  for await (const object of listAll(bucket, prefix, depth === "infinity")) {
    objects.push(object);
  }

  return objects;
}

// Normalize the Depth header to one of "0" | "1" | "infinity".
// Maps the WebDavClient ApplyTo values: ResourceOnly => 0,
// ResourceAndChildren => 1, ResourceAndAncestors => infinity.
function normalizeDepth(rawDepth: string | null) {
  const value = (rawDepth ?? "infinity").trim().toLowerCase();
  if (value === "0" || value === "1") return value;
  return "infinity";
}

export async function handleRequestPropfind({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  const responseTemplate = `<?xml version="1.0" encoding="utf-8" ?>
<multistatus xmlns="DAV:" xmlns:fd="flaredrive">
{{items}}
</multistatus>`;

  // Clients list a collection by requesting it with a trailing slash
  // (e.g. /webdav/folder/). Normalize so we resolve the stored key.
  const normalizedPath = path.replace(/\/+$/, "");
  const hadTrailingSlash = path !== normalizedPath;

  let rootObject: R2Object | typeof ROOT_OBJECT | null =
    normalizedPath === "" ? ROOT_OBJECT : await bucket.head(normalizedPath);

  // No explicit object: it may still be an implied (virtual) collection,
  // i.e. a prefix that has children but no x-directory placeholder.
  let isImpliedCollection = false;
  if (!rootObject) {
    const probe = await bucket.list({
      prefix: `${normalizedPath}/`,
      delimiter: "/",
      // @ts-ignore
      include: ["httpMetadata", "customMetadata"],
    });
    if (probe.objects.length > 0 || probe.delimitedPrefixes.length > 0) {
      isImpliedCollection = true;
      rootObject = {
        ...ROOT_OBJECT,
        key: normalizedPath,
      };
    }
  }

  if (!rootObject) return new Response("Not found", { status: 404 });

  const isDirectory =
    rootObject === ROOT_OBJECT ||
    isImpliedCollection ||
    rootObject.httpMetadata?.contentType === "application/x-directory";

  // A trailing slash on a non-collection is not a valid resource.
  if (hadTrailingSlash && !isDirectory)
    return new Response("Not found", { status: 404 });

  const depth = normalizeDepth(request.headers.get("Depth"));

  const children = !isDirectory
    ? []
    : await findChildren({
        bucket,
        path: normalizedPath,
        depth,
      });

  const items = [rootObject, ...children].map((child) => {
    const properties = fromR2Object(child);
    return `
  <response>
    <href>${escapeXml(encodeURI(`${WEBDAV_ENDPOINT}${child.key}`))}</href>
    <propstat>
      <prop>
        ${Object.entries(properties)
          .filter(([_, value]) => value !== undefined)
          .map(([key, value]) =>
            key === "resourcetype"
              ? `<${key}>${value}</${key}>`
              : `<${key}>${escapeXml(value ?? "")}</${key}>`
          )
          .join("\n")}
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>`;
  });

  return new Response(responseTemplate.replace("{{items}}", items.join("")), {
    status: 207,
    headers: { "Content-Type": "application/xml" },
  });
}
