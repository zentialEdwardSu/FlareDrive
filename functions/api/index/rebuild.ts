/// <reference types="@cloudflare/workers-types" />

import { AuthEnv, getAuthBucket, json, readSession } from "../../auth/utils";
import {
  driveIdFromRequest,
  getDatabase,
  indexedFromR2,
  IndexedObject,
  objectName,
  parentPath,
  setRuntimeState,
  upsertObjectStatement,
} from "../../db";

const INTERNAL_PREFIX = "_$flaredrive$/";
const PASSKEY_PREFIX = `${INTERNAL_PREFIX}auth/passkeys/`;
const SHARE_PREFIX = `${INTERNAL_PREFIX}shares/`;

type LegacyCredential = {
  id: string;
  user: string;
  publicKeyJwk: JsonWebKey;
  signCount: number;
  createdAt: number;
  name?: string;
  lastUsedAt?: number;
};

type LegacyShare = {
  id: string;
  path: string;
  token: string;
  objectVersion: string;
  createdAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
  revision?: number;
};

function sameOrigin(request: Request) {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

function syntheticDirectory(driveId: string, path: string, uploadedAt: number): IndexedObject {
  return {
    driveId,
    path,
    parentPath: parentPath(path),
    name: objectName(path),
    isDirectory: true,
    size: 0,
    etag: `virtual-${path}`,
    version: `virtual-${path}`,
    uploadedAt,
    contentType: "application/x-directory",
    contentDisposition: null,
    contentLanguage: null,
    thumbnail: null,
  };
}

function addObjectWithParents(objects: Map<string, IndexedObject>, object: IndexedObject) {
  objects.set(object.path, object);
  let parent = object.parentPath;
  while (parent) {
    if (!objects.has(parent)) {
      objects.set(parent, syntheticDirectory(object.driveId, parent, object.uploadedAt));
    }
    parent = parentPath(parent);
  }
}

async function readJson<T>(bucket: R2Bucket, key: string) {
  const object = await bucket.get(key);
  if (!object) return null;
  try {
    return (await object.json()) as T;
  } catch {
    return null;
  }
}

async function collectBucket(bucket: R2Bucket, driveId: string) {
  const objects = new Map<string, IndexedObject>();
  const legacyPasskeys: Array<{ key: string; value: LegacyCredential }> = [];
  const legacyShares: Array<{ key: string; value: LegacyShare }> = [];
  const legacyChallengeKeys: string[] = [];
  let cursor: string | undefined;

  do {
    const listed = await bucket.list({
      cursor,
      // The Workers type bundled with this project predates the include option.
      // @ts-ignore
      include: ["httpMetadata", "customMetadata"],
    });
    for (const object of listed.objects) {
      if (!object.key.startsWith(INTERNAL_PREFIX)) {
        addObjectWithParents(objects, indexedFromR2(driveId, object));
      } else if (object.key.startsWith(PASSKEY_PREFIX)) {
        const credential = await readJson<LegacyCredential>(bucket, object.key);
        if (credential?.id && credential.publicKeyJwk) {
          legacyPasskeys.push({ key: object.key, value: credential });
        }
      } else if (object.key.startsWith(SHARE_PREFIX)) {
        const share = await readJson<LegacyShare>(bucket, object.key);
        if (share?.id && share.path && share.token) {
          legacyShares.push({ key: object.key, value: share });
        }
      } else if (object.key.startsWith(`${INTERNAL_PREFIX}auth/challenges/`)) {
        legacyChallengeKeys.push(object.key);
      }
    }
    cursor = listed.truncated ? (listed as R2Objects & { cursor: string }).cursor : undefined;
  } while (cursor);

  return { objects: [...objects.values()], legacyPasskeys, legacyShares, legacyChallengeKeys };
}

async function runBatches(db: D1Database, statements: D1PreparedStatement[]) {
  for (let offset = 0; offset < statements.length; offset += 100) {
    await db.batch(statements.slice(offset, offset + 100));
  }
}

async function rebuild(request: Request, env: AuthEnv) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin" }, { status: 403 });
  const bucket = getAuthBucket({ request, env });
  if (!bucket) return json({ error: "Storage bucket is not configured" }, { status: 500 });
  const db = getDatabase(env);
  const driveId = driveIdFromRequest(request, env);
  const collected = await collectBucket(bucket, driveId);

  await db.prepare("DELETE FROM runtime_objects WHERE drive_id = ?").bind(driveId).run();
  await runBatches(db, collected.objects.map((object) => upsertObjectStatement(db, object)));

  const passkeyStatements = collected.legacyPasskeys.map(({ value: credential }) => db.prepare(`
    INSERT OR IGNORE INTO runtime_passkeys
      (drive_id, id, user, public_key_jwk, sign_count, created_at, name, last_used_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    driveId, credential.id, credential.user, JSON.stringify(credential.publicKeyJwk),
    credential.signCount, credential.createdAt, credential.name ?? null,
    credential.lastUsedAt ?? null
  ));
  await runBatches(db, passkeyStatements);

  const shareStatements = collected.legacyShares.map(({ value: share }) => db.prepare(`
    INSERT OR IGNORE INTO runtime_shares
      (drive_id, id, path, token, object_version, created_at, expires_at, revoked_at, revision)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    driveId, share.id, share.path, share.token, share.objectVersion,
    share.createdAt, share.expiresAt, share.revokedAt, share.revision ?? 1
  ));
  await runBatches(db, shareStatements);

  const migratedKeys = [
    ...collected.legacyPasskeys.map(({ key }) => key),
    ...collected.legacyShares.map(({ key }) => key),
    ...collected.legacyChallengeKeys,
  ];
  for (let offset = 0; offset < migratedKeys.length; offset += 1000) {
    await bucket.delete(migratedKeys.slice(offset, offset + 1000));
  }

  const rebuiltAt = Date.now();
  await setRuntimeState(db, driveId, "index", JSON.stringify({
    rebuiltAt,
    objectCount: collected.objects.length,
  }));

  return json({
    rebuiltAt,
    objectCount: collected.objects.length,
    importedPasskeys: collected.legacyPasskeys.length,
    importedShares: collected.legacyShares.length,
  });
}

async function status(request: Request, env: AuthEnv) {
  const db = getDatabase(env);
  const driveId = driveIdFromRequest(request, env);
  const state = await db.prepare(
    "SELECT value, updated_at FROM runtime_state WHERE drive_id = ? AND key = 'index'"
  ).bind(driveId).first<{ value: string; updated_at: number }>();
  const count = await db.prepare(
    "SELECT COUNT(*) AS count FROM runtime_objects WHERE drive_id = ?"
  ).bind(driveId).first<{ count: number }>();
  return json({
    objectCount: count?.count ?? 0,
    lastRebuild: state ? { ...JSON.parse(state.value), updatedAt: state.updated_at } : null,
  });
}

export const onRequest: PagesFunction<AuthEnv> = async (context) => {
  if (!(await readSession(context.request, context.env))) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    if (context.request.method === "GET") return status(context.request, context.env);
    if (context.request.method === "POST") return rebuild(context.request, context.env);
    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: (error as Error).message }, { status: 500 });
  }
};
