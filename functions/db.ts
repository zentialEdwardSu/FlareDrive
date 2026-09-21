/// <reference types="@cloudflare/workers-types" />

export type RuntimeEnv = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  DRIVE_ID?: string;
  [key: string]: unknown;
};

export type IndexedObject = {
  driveId: string;
  path: string;
  parentPath: string;
  name: string;
  isDirectory: boolean;
  size: number;
  etag: string;
  version: string;
  uploadedAt: number;
  contentType: string | null;
  contentDisposition: string | null;
  contentLanguage: string | null;
  thumbnail: string | null;
};

type ObjectRow = {
  drive_id: string;
  path: string;
  parent_path: string;
  name: string;
  is_directory: number;
  size: number;
  etag: string;
  version: string;
  uploaded_at: number;
  content_type: string | null;
  content_disposition: string | null;
  content_language: string | null;
  thumbnail: string | null;
};

export function getDatabase(env: RuntimeEnv) {
  if (!env.DB) throw new Error("D1 database binding DB is not configured");
  return env.DB;
}

export function driveIdFromRequest(request: Request, env?: RuntimeEnv) {
  return env?.DRIVE_ID?.trim() || new URL(request.url).hostname.replace(/\..*/, "");
}

export function parentPath(path: string) {
  const normalized = path.replace(/\/$/, "");
  const index = normalized.lastIndexOf("/");
  return index < 0 ? "" : normalized.slice(0, index);
}

export function objectName(path: string) {
  return path.replace(/\/$/, "").split("/").pop() || path;
}

export function indexedFromR2(driveId: string, object: R2Object): IndexedObject {
  return {
    driveId,
    path: object.key,
    parentPath: parentPath(object.key),
    name: objectName(object.key),
    isDirectory: object.httpMetadata?.contentType === "application/x-directory",
    size: object.size,
    etag: object.etag,
    version: object.version,
    uploadedAt: object.uploaded.getTime(),
    contentType: object.httpMetadata?.contentType ?? null,
    contentDisposition: object.httpMetadata?.contentDisposition ?? null,
    contentLanguage: object.httpMetadata?.contentLanguage ?? null,
    thumbnail: object.customMetadata?.thumbnail ?? null,
  };
}

function fromRow(row: ObjectRow): IndexedObject {
  return {
    driveId: row.drive_id,
    path: row.path,
    parentPath: row.parent_path,
    name: row.name,
    isDirectory: Boolean(row.is_directory),
    size: row.size,
    etag: row.etag,
    version: row.version,
    uploadedAt: row.uploaded_at,
    contentType: row.content_type,
    contentDisposition: row.content_disposition,
    contentLanguage: row.content_language,
    thumbnail: row.thumbnail,
  };
}

export function upsertObjectStatement(db: D1Database, object: IndexedObject) {
  return db.prepare(`
    INSERT INTO runtime_objects (
      drive_id, path, parent_path, name, is_directory, size, etag, version,
      uploaded_at, content_type, content_disposition, content_language, thumbnail
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (drive_id, path) DO UPDATE SET
      parent_path = excluded.parent_path,
      name = excluded.name,
      is_directory = excluded.is_directory,
      size = excluded.size,
      etag = excluded.etag,
      version = excluded.version,
      uploaded_at = excluded.uploaded_at,
      content_type = excluded.content_type,
      content_disposition = excluded.content_disposition,
      content_language = excluded.content_language,
      thumbnail = excluded.thumbnail
  `).bind(
    object.driveId, object.path, object.parentPath, object.name,
    object.isDirectory ? 1 : 0, object.size, object.etag, object.version,
    object.uploadedAt, object.contentType, object.contentDisposition,
    object.contentLanguage, object.thumbnail
  );
}

export async function upsertObject(db: D1Database, driveId: string, object: R2Object) {
  if (object.key.startsWith("_$flaredrive$/")) return;
  await upsertObjectStatement(db, indexedFromR2(driveId, object)).run();
}

export async function getIndexedObject(db: D1Database, driveId: string, path: string) {
  const row = await db.prepare(
    "SELECT * FROM runtime_objects WHERE drive_id = ? AND path = ?"
  ).bind(driveId, path).first<ObjectRow>();
  return row ? fromRow(row) : null;
}

export async function listIndexedObjects(
  db: D1Database,
  driveId: string,
  path: string,
  recursive = false
) {
  const prefix = path ? `${path.replace(/\/$/, "")}/` : "";
  const statement = recursive
    ? db.prepare(`
        SELECT * FROM runtime_objects
        WHERE drive_id = ? AND path >= ? AND path < ?
        ORDER BY path
      `).bind(driveId, prefix, `${prefix}\uffff`)
    : db.prepare(`
        SELECT * FROM runtime_objects
        WHERE drive_id = ? AND parent_path = ?
        ORDER BY is_directory DESC, name COLLATE NOCASE
      `).bind(driveId, path.replace(/\/$/, ""));
  const result = await statement.all<ObjectRow>();
  return result.results.map(fromRow);
}

export async function deleteIndexedTree(db: D1Database, driveId: string, path: string) {
  if (!path) {
    await db.prepare("DELETE FROM runtime_objects WHERE drive_id = ?").bind(driveId).run();
    return;
  }
  const prefix = `${path.replace(/\/$/, "")}/`;
  await db.prepare(`
    DELETE FROM runtime_objects
    WHERE drive_id = ? AND (path = ? OR (path >= ? AND path < ?))
  `).bind(driveId, path, prefix, `${prefix}\uffff`).run();
}

export async function setRuntimeState(
  db: D1Database,
  driveId: string,
  key: string,
  value: string
) {
  await db.prepare(`
    INSERT INTO runtime_state (drive_id, key, value, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (drive_id, key) DO UPDATE SET
      value = excluded.value, updated_at = excluded.updated_at
  `).bind(driveId, key, value, Date.now()).run();
}
