import { AuthEnv, getAuthBucket, json, readSession } from "../../auth/utils";
import { driveIdFromRequest, getDatabase, getIndexedObject } from "../../db";
import {
  insertShare, listShareRecords, publicShare, randomShareToken, readShareById,
  readShareForPath, replaceShare, ShareRecord, shareIdForPath, shareStatus,
} from "../../shares";

function routePath(context: EventContext<AuthEnv, string, unknown>) {
  const value = context.params.path;
  return Array.isArray(value) ? value.join("/") : value ?? "";
}

function sameOrigin(request: Request) {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

function parseExpiry(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= Date.now()) {
    throw new Error("Expiry must be a future date or permanent");
  }
  return value;
}

async function managedShare(db: D1Database, driveId: string, record: ShareRecord, origin: string) {
  const share = publicShare(record, origin);
  if (share.status !== "active") return share;
  const object = await getIndexedObject(db, driveId, record.path);
  return object && object.version === record.objectVersion
    ? share
    : { ...share, status: "invalid" as const };
}

async function listShares(db: D1Database, driveId: string, request: Request) {
  const url = new URL(request.url);
  const requestedPath = url.searchParams.get("path");
  if (requestedPath !== null) {
    const record = await readShareForPath(db, driveId, requestedPath);
    return json({ share: record ? await managedShare(db, driveId, record, url.origin) : null });
  }
  const result = await listShareRecords(db, driveId, url.searchParams.get("cursor") ?? undefined);
  return json({
    shares: await Promise.all(result.records.map((record) => managedShare(db, driveId, record, url.origin))),
    cursor: result.cursor,
  });
}

async function createShare(db: D1Database, driveId: string, request: Request) {
  const body = (await request.json()) as { path?: string; expiresAt?: number | null };
  const path = body.path?.replace(/^\/+/, "");
  if (!path || path.startsWith("_$flaredrive$/")) return json({ error: "Invalid file" }, { status: 400 });
  let expiresAt: number | null;
  try {
    expiresAt = parseExpiry(body.expiresAt === undefined
      ? Date.now() + 7 * 24 * 60 * 60 * 1000 : body.expiresAt);
  } catch (error) {
    return json({ error: (error as Error).message }, { status: 400 });
  }

  const object = await getIndexedObject(db, driveId, path);
  if (!object) return json({ error: "File not found in D1 index" }, { status: 404 });
  if (object.isDirectory) return json({ error: "Folders cannot be shared" }, { status: 400 });

  const existing = await readShareForPath(db, driveId, path);
  if (existing && shareStatus(existing) === "active" && existing.objectVersion === object.version) {
    return json({ share: publicShare(existing, new URL(request.url).origin) });
  }
  const record: ShareRecord = {
    id: await shareIdForPath(path), path, token: randomShareToken(),
    objectVersion: object.version, createdAt: Date.now(), expiresAt,
    revokedAt: null, revision: (existing?.revision ?? 0) + 1,
  };
  const saved = existing
    ? await replaceShare(db, driveId, record, existing.revision)
    : await insertShare(db, driveId, record);
  if (!saved) {
    const concurrent = await readShareForPath(db, driveId, path);
    if (concurrent && shareStatus(concurrent) === "active" && concurrent.objectVersion === object.version) {
      return json({ share: publicShare(concurrent, new URL(request.url).origin) });
    }
    return json({ error: "Share changed; try again" }, { status: 409 });
  }
  return json({ share: publicShare(record, new URL(request.url).origin) }, { status: 201 });
}

async function updateShare(db: D1Database, driveId: string, request: Request, id: string) {
  const stored = await readShareById(db, driveId, id);
  if (!stored) return json({ error: "Share not found" }, { status: 404 });
  if (shareStatus(stored) !== "active") return json({ error: "Only active shares can be updated" }, { status: 409 });
  const source = await getIndexedObject(db, driveId, stored.path);
  if (!source || source.version !== stored.objectVersion) {
    return json({ error: "The file changed; create a new share" }, { status: 409 });
  }
  let expiresAt: number | null;
  try {
    const body = (await request.json()) as { expiresAt?: number | null };
    expiresAt = parseExpiry(body.expiresAt ?? null);
  } catch (error) {
    return json({ error: (error as Error).message }, { status: 400 });
  }
  const record = { ...stored, expiresAt, revision: stored.revision + 1 };
  if (!(await replaceShare(db, driveId, record, stored.revision))) {
    return json({ error: "Share changed; reload and try again" }, { status: 409 });
  }
  return json({ share: await managedShare(db, driveId, record, new URL(request.url).origin) });
}

async function revokeShare(db: D1Database, driveId: string, request: Request, id: string) {
  const stored = await readShareById(db, driveId, id);
  if (!stored) return json({ error: "Share not found" }, { status: 404 });
  const record = { ...stored, revokedAt: stored.revokedAt ?? Date.now(), revision: stored.revision + 1 };
  if (!(await replaceShare(db, driveId, record, stored.revision))) {
    return json({ error: "Share changed; reload and try again" }, { status: 409 });
  }
  return json({ share: publicShare(record, new URL(request.url).origin) });
}

export const onRequest: PagesFunction<AuthEnv> = async (context) => {
  const bucket = getAuthBucket(context);
  if (!bucket) return json({ error: "Storage bucket is not configured" }, { status: 500 });
  if (!(await readSession(context.request, context.env))) return json({ error: "Unauthorized" }, { status: 401 });
  let db: D1Database;
  try { db = getDatabase(context.env); }
  catch (error) { return json({ error: (error as Error).message }, { status: 500 }); }
  const driveId = driveIdFromRequest(context.request, context.env);
  const method = context.request.method;
  const id = routePath(context);
  if (method !== "GET" && !sameOrigin(context.request)) return json({ error: "Invalid request origin" }, { status: 403 });
  if (method === "GET" && !id) return listShares(db, driveId, context.request);
  if (method === "POST" && !id) return createShare(db, driveId, context.request);
  if (method === "PATCH" && id) return updateShare(db, driveId, context.request, id);
  if (method === "DELETE" && id) return revokeShare(db, driveId, context.request, id);
  return json({ error: "Not found" }, { status: 404 });
};
