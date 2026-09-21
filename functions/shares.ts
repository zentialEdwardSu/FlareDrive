/// <reference types="@cloudflare/workers-types" />

import { base64UrlEncode, sha256 } from "./auth/utils";
import { getIndexedObject } from "./db";

export type ShareRecord = {
  id: string;
  path: string;
  token: string;
  objectVersion: string;
  createdAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
  revision: number;
};

type ShareRow = {
  id: string; path: string; token: string; object_version: string;
  created_at: number; expires_at: number | null; revoked_at: number | null;
  revision: number;
};

function fromRow(row: ShareRow): ShareRecord {
  return {
    id: row.id, path: row.path, token: row.token, objectVersion: row.object_version,
    createdAt: row.created_at, expiresAt: row.expires_at,
    revokedAt: row.revoked_at, revision: row.revision,
  };
}

export function shareStatus(record: ShareRecord, now = Date.now()) {
  if (record.revokedAt) return "revoked" as const;
  if (record.expiresAt !== null && record.expiresAt <= now) return "expired" as const;
  return "active" as const;
}

export function publicShare(record: ShareRecord, origin: string) {
  const encodedPath = record.path.split("/").map(encodeURIComponent).join("/");
  const url = new URL(`/webdav/${encodedPath}`, origin);
  url.searchParams.set("share", record.token);
  return { ...record, status: shareStatus(record), url: url.toString() };
}

export async function shareIdForPath(path: string) {
  return base64UrlEncode(await sha256(path));
}

export async function readShareById(db: D1Database, driveId: string, id: string) {
  const row = await db.prepare(
    "SELECT * FROM runtime_shares WHERE drive_id = ? AND id = ?"
  ).bind(driveId, id).first<ShareRow>();
  return row ? fromRow(row) : null;
}

export async function readShareForPath(db: D1Database, driveId: string, path: string) {
  const row = await db.prepare(
    "SELECT * FROM runtime_shares WHERE drive_id = ? AND path = ?"
  ).bind(driveId, path).first<ShareRow>();
  return row ? fromRow(row) : null;
}

export async function listShareRecords(db: D1Database, driveId: string, cursor?: string, limit = 100) {
  const cursorRecord = cursor ? await readShareById(db, driveId, cursor) : null;
  const result = cursorRecord
    ? await db.prepare(`SELECT * FROM runtime_shares
        WHERE drive_id = ? AND (created_at < ? OR (created_at = ? AND id > ?))
        ORDER BY created_at DESC, id LIMIT ?`)
        .bind(driveId, cursorRecord.createdAt, cursorRecord.createdAt, cursorRecord.id, limit + 1)
        .all<ShareRow>()
    : await db.prepare(`SELECT * FROM runtime_shares
        WHERE drive_id = ? ORDER BY created_at DESC, id LIMIT ?`)
        .bind(driveId, limit + 1).all<ShareRow>();
  const records = result.results.map(fromRow);
  return { records: records.slice(0, limit), cursor: records.length > limit ? records[limit - 1].id : null };
}

export async function insertShare(db: D1Database, driveId: string, record: ShareRecord) {
  const result = await db.prepare(`INSERT OR IGNORE INTO runtime_shares
    (drive_id, id, path, token, object_version, created_at, expires_at, revoked_at, revision)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(driveId, record.id, record.path, record.token, record.objectVersion,
      record.createdAt, record.expiresAt, record.revokedAt, record.revision).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function replaceShare(db: D1Database, driveId: string, record: ShareRecord, expectedRevision: number) {
  const result = await db.prepare(`UPDATE runtime_shares SET
    token = ?, object_version = ?, created_at = ?, expires_at = ?, revoked_at = ?, revision = ?
    WHERE drive_id = ? AND id = ? AND revision = ?`)
    .bind(record.token, record.objectVersion, record.createdAt, record.expiresAt,
      record.revokedAt, record.revision, driveId, record.id, expectedRevision).run();
  return (result.meta.changes ?? 0) > 0;
}

export function randomShareToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function hasValidShare(db: D1Database, driveId: string, path: string, token: string) {
  const record = await readShareForPath(db, driveId, path);
  if (!record || record.token !== token || shareStatus(record) !== "active") return false;
  const object = await getIndexedObject(db, driveId, path);
  return Boolean(object && !object.isDirectory && record.objectVersion === object.version);
}
