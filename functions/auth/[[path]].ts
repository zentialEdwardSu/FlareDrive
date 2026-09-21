import { verifyTOTP } from "../webdav/utils";
import { driveIdFromRequest, getDatabase } from "../db";
import {
  AuthEnv,
  base64UrlDecode,
  base64UrlEncode,
  clearSessionCookie,
  createSessionCookie,
  json,
  parseIntegerEnv,
  readSession,
  sha256,
} from "./utils";

const CHALLENGE_SECONDS = 5 * 60;

type StoredCredential = {
  id: string;
  user: string;
  publicKeyJwk: JsonWebKey;
  signCount: number;
  createdAt: number;
  name?: string;
  lastUsedAt?: number;
};

function pathFromContext(context: EventContext<AuthEnv, string, unknown>) {
  const path = context.params.path;
  return Array.isArray(path) ? path.join("/") : path ?? "";
}

function originFromRequest(request: Request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function rpIdFromRequest(request: Request) {
  return new URL(request.url).hostname;
}

function isSameOrigin(request: Request) {
  return request.headers.get("Origin") === originFromRequest(request);
}

async function randomChallenge() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function challengeKey(challenge: string) {
  return base64UrlEncode(await sha256(challenge));
}

async function saveChallenge(
  db: D1Database,
  driveId: string,
  challenge: string,
  type: "create" | "get",
  user: string
) {
  await db.batch([
    db.prepare("DELETE FROM runtime_auth_challenges WHERE expires_at < ?").bind(Date.now()),
    db.prepare(`INSERT OR REPLACE INTO runtime_auth_challenges
      (drive_id, challenge_hash, challenge, type, user, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(driveId, await challengeKey(challenge), challenge, type, user,
        Date.now() + CHALLENGE_SECONDS * 1000),
  ]);
}

async function consumeChallenge(
  db: D1Database,
  driveId: string,
  challenge: string,
  type: "create" | "get"
) {
  const key = await challengeKey(challenge);
  const stored = await db.prepare(`SELECT challenge, type, user, expires_at
    FROM runtime_auth_challenges WHERE drive_id = ? AND challenge_hash = ?`)
    .bind(driveId, key).first<{
    challenge: string;
    type: "create" | "get";
    user: string;
    expires_at: number;
  }>();
  if (!stored) return null;
  await db.prepare("DELETE FROM runtime_auth_challenges WHERE drive_id = ? AND challenge_hash = ?")
    .bind(driveId, key).run();

  if (stored.challenge !== challenge || stored.type !== type || stored.expires_at < Date.now()) {
    return null;
  }
  return stored;
}

async function listCredentials(db: D1Database, driveId: string) {
  const result = await db.prepare("SELECT * FROM runtime_passkeys WHERE drive_id = ?")
    .bind(driveId).all<any>();
  return result.results.map((row) => ({
    id: row.id, user: row.user, publicKeyJwk: JSON.parse(row.public_key_jwk),
    signCount: row.sign_count, createdAt: row.created_at,
    name: row.name ?? undefined, lastUsedAt: row.last_used_at ?? undefined,
  } as StoredCredential));
}

async function getCredential(db: D1Database, driveId: string, id: string) {
  const row = await db.prepare("SELECT * FROM runtime_passkeys WHERE drive_id = ? AND id = ?")
    .bind(driveId, id).first<any>();
  return row ? ({
    id: row.id, user: row.user, publicKeyJwk: JSON.parse(row.public_key_jwk),
    signCount: row.sign_count, createdAt: row.created_at,
    name: row.name ?? undefined, lastUsedAt: row.last_used_at ?? undefined,
  } as StoredCredential) : null;
}

async function saveCredential(db: D1Database, driveId: string, credential: StoredCredential) {
  await db.prepare(`INSERT INTO runtime_passkeys
    (drive_id, id, user, public_key_jwk, sign_count, created_at, name, last_used_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (drive_id, id) DO UPDATE SET
      user = excluded.user, public_key_jwk = excluded.public_key_jwk,
      sign_count = excluded.sign_count, created_at = excluded.created_at,
      name = excluded.name, last_used_at = excluded.last_used_at`)
    .bind(driveId, credential.id, credential.user, JSON.stringify(credential.publicKeyJwk),
      credential.signCount, credential.createdAt, credential.name ?? null,
      credential.lastUsedAt ?? null).run();
}

function publicCredential(credential: StoredCredential) {
  return {
    id: credential.id,
    name: credential.name || `Passkey · ${credential.id.slice(-6)}`,
    createdAt: credential.createdAt,
    lastUsedAt: credential.lastUsedAt ?? null,
  };
}

async function handleListPasskeys(request: Request, env: AuthEnv, db: D1Database, driveId: string) {
  if (!(await readSession(request, env))) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const credentials = await listCredentials(db, driveId);
  return json({
    passkeys: credentials
      .map(publicCredential)
      .sort((a, b) => b.createdAt - a.createdAt),
  });
}

async function handleRenamePasskey(
  request: Request,
  env: AuthEnv,
  db: D1Database,
  driveId: string,
  id: string
) {
  if (!(await readSession(request, env))) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSameOrigin(request)) return json({ error: "Invalid request origin" }, { status: 403 });
  const stored = await getCredential(db, driveId, id);
  if (!stored) return json({ error: "Passkey not found" }, { status: 404 });
  const body = (await request.json()) as { name?: string };
  const name = body.name?.trim();
  if (!name || name.length > 64) {
    return json({ error: "Name must be between 1 and 64 characters" }, { status: 400 });
  }
  const updated = { ...stored, name };
  await saveCredential(db, driveId, updated);
  return json({ passkey: publicCredential(updated) });
}

async function handleDeletePasskey(
  request: Request,
  env: AuthEnv,
  db: D1Database,
  driveId: string,
  id: string
) {
  if (!(await readSession(request, env))) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSameOrigin(request)) return json({ error: "Invalid request origin" }, { status: 403 });
  const stored = await getCredential(db, driveId, id);
  if (!stored) return json({ error: "Passkey not found" }, { status: 404 });
  await db.prepare("DELETE FROM runtime_passkeys WHERE drive_id = ? AND id = ?")
    .bind(driveId, id).run();
  return json({ deleted: true });
}

class CborReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  read(): any {
    const initial = this.bytes[this.offset++];
    const major = initial >> 5;
    const additional = initial & 0x1f;
    const length = this.readLength(additional);

    if (major === 0) return length;
    if (major === 1) return -1 - length;
    if (major === 2) return this.readBytes(length);
    if (major === 3) return new TextDecoder().decode(this.readBytes(length));
    if (major === 4) return Array.from({ length }, () => this.read());
    if (major === 5) {
      const map = new Map<any, any>();
      for (let i = 0; i < length; i++) map.set(this.read(), this.read());
      return map;
    }
    if (major === 7) {
      if (additional === 20) return false;
      if (additional === 21) return true;
      if (additional === 22) return null;
    }
    throw new Error("Unsupported CBOR value");
  }

  private readLength(additional: number) {
    if (additional < 24) return additional;
    if (additional === 24) return this.bytes[this.offset++];
    if (additional === 25) return (this.bytes[this.offset++] << 8) | this.bytes[this.offset++];
    if (additional === 26) {
      const value =
        (this.bytes[this.offset] << 24) |
        (this.bytes[this.offset + 1] << 16) |
        (this.bytes[this.offset + 2] << 8) |
        this.bytes[this.offset + 3];
      this.offset += 4;
      return value >>> 0;
    }
    throw new Error("Unsupported CBOR length");
  }

  private readBytes(length: number) {
    const value = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }
}

function parseAuthenticatorData(authData: Uint8Array) {
  const flags = authData[32];
  const signCount = new DataView(authData.buffer, authData.byteOffset + 33, 4).getUint32(0);
  let credentialId: Uint8Array | undefined;
  let publicKeyJwk: JsonWebKey | undefined;

  if (flags & 0x40) {
    const credentialIdLength = new DataView(authData.buffer, authData.byteOffset + 53, 2).getUint16(0);
    credentialId = authData.slice(55, 55 + credentialIdLength);
    const coseKey = new CborReader(authData.slice(55 + credentialIdLength)).read() as Map<any, any>;
    const x = coseKey.get(-2) as Uint8Array;
    const y = coseKey.get(-3) as Uint8Array;
    publicKeyJwk = {
      kty: "EC",
      crv: "P-256",
      x: base64UrlEncode(x),
      y: base64UrlEncode(y),
      ext: true,
    };
  }

  return {
    rpIdHash: authData.slice(0, 32),
    flags,
    signCount,
    credentialId,
    publicKeyJwk,
  };
}

async function parseClientData(clientDataJSON: string, expectedType: "webauthn.create" | "webauthn.get") {
  const bytes = base64UrlDecode(clientDataJSON);
  const clientData = JSON.parse(new TextDecoder().decode(bytes)) as {
    type: string;
    challenge: string;
    origin: string;
  };
  return clientData.type === expectedType ? clientData : null;
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

async function verifyRpAndOrigin(request: Request, clientData: { origin: string }, authData: Uint8Array) {
  const parsed = parseAuthenticatorData(authData);
  const expectedRpHash = await sha256(rpIdFromRequest(request));
  return Boolean(parsed.flags & 0x01) && clientData.origin === originFromRequest(request) && sameBytes(parsed.rpIdHash, expectedRpHash);
}

function derEcdsaToRaw(signature: Uint8Array) {
  let offset = 3;
  const rLength = signature[offset++];
  const r = signature.slice(offset, offset + rLength);
  offset += rLength + 1;
  const sLength = signature[offset++];
  const s = signature.slice(offset, offset + sLength);
  const normalize = (value: Uint8Array) => {
    const trimmed = value.length > 32 ? value.slice(value.length - 32) : value;
    const output = new Uint8Array(32);
    output.set(trimmed, 32 - trimmed.length);
    return output;
  };
  const raw = new Uint8Array(64);
  raw.set(normalize(r), 0);
  raw.set(normalize(s), 32);
  return raw;
}

async function handleStatus(request: Request, env: AuthEnv, db: D1Database, driveId: string) {
  const credentials = await listCredentials(db, driveId);
  return json({
    authenticated: Boolean(await readSession(request, env)),
    passkeyAvailable: credentials.length > 0,
  });
}

async function handlePasswordLogin(request: Request, env: AuthEnv) {
  const body = (await request.json()) as {
    username?: string;
    password?: string;
    totp?: string;
  };
  const username = body.username ?? "";
  const password = body.password ?? "";
  const totp = body.totp ?? "";

  const passwordOk =
    Boolean(env.WEBDAV_USERNAME && env.WEBDAV_PASSWORD) &&
    username === env.WEBDAV_USERNAME &&
    password === env.WEBDAV_PASSWORD;
  const hasTotp = Boolean(env.WEBDAV_2FA_SECRET);
  const totpOk = hasTotp
    ? await verifyTOTP(totp || password, env.WEBDAV_2FA_SECRET!, parseIntegerEnv(env.WEBDAV_2FA_WINDOW, 0))
    : true;
  const directTotpOk =
    env.WEBDAV_TOTP_DIRECT_LOGIN === "1" &&
    hasTotp &&
    !username &&
    (await verifyTOTP(password || totp, env.WEBDAV_2FA_SECRET!, parseIntegerEnv(env.WEBDAV_2FA_WINDOW, 0)));

  if (!directTotpOk && !(passwordOk && totpOk)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  return json(
    { authenticated: true },
    { headers: { "Set-Cookie": await createSessionCookie(env, username || "totp") } }
  );
}

async function handleRegisterOptions(request: Request, env: AuthEnv, db: D1Database, driveId: string) {
  const session = await readSession(request, env);
  if (!session) return json({ error: "Unauthorized" }, { status: 401 });

  const challenge = await randomChallenge();
  await saveChallenge(db, driveId, challenge, "create", session.sub);

  return json({
    challenge,
    rp: { name: "FlareDrive", id: rpIdFromRequest(request) },
    user: {
      id: base64UrlEncode(await sha256(session.sub)),
      name: session.sub,
      displayName: session.sub,
    },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    timeout: CHALLENGE_SECONDS * 1000,
    attestation: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
  });
}

async function handleRegisterVerify(request: Request, env: AuthEnv, db: D1Database, driveId: string) {
  const session = await readSession(request, env);
  if (!session) return json({ error: "Unauthorized" }, { status: 401 });

  const credential = (await request.json()) as {
    id: string;
    rawId: string;
    name?: string;
    response: { clientDataJSON: string; attestationObject: string };
  };
  const clientData = await parseClientData(credential.response.clientDataJSON, "webauthn.create");
  if (!clientData) return json({ error: "Invalid credential" }, { status: 400 });
  const challenge = await consumeChallenge(db, driveId, clientData.challenge, "create");
  if (!challenge || challenge.user !== session.sub) return json({ error: "Invalid challenge" }, { status: 400 });

  const attestationObject = new CborReader(base64UrlDecode(credential.response.attestationObject)).read() as Map<any, any>;
  const authData = attestationObject.get("authData") as Uint8Array;
  if (!(await verifyRpAndOrigin(request, clientData, authData))) {
    return json({ error: "Invalid authenticator data" }, { status: 400 });
  }

  const parsed = parseAuthenticatorData(authData);
  if ((parsed.flags & 0x04) === 0) {
    return json({ error: "User verification is required" }, { status: 401 });
  }
  if (!parsed.credentialId || !parsed.publicKeyJwk) return json({ error: "Missing public key" }, { status: 400 });
  if (credential.rawId !== base64UrlEncode(parsed.credentialId)) {
    return json({ error: "Credential ID mismatch" }, { status: 400 });
  }

  await saveCredential(db, driveId, {
    id: base64UrlEncode(parsed.credentialId),
    user: session.sub,
    publicKeyJwk: parsed.publicKeyJwk,
    signCount: parsed.signCount,
    createdAt: Date.now(),
    name: credential.name?.trim().slice(0, 64) || undefined,
  });

  return json({ registered: true });
}

async function handleLoginOptions(request: Request, db: D1Database, driveId: string) {
  const credentials = await listCredentials(db, driveId);
  if (!credentials.length) return json({ error: "No passkeys registered" }, { status: 404 });

  const challenge = await randomChallenge();
  await saveChallenge(db, driveId, challenge, "get", "");

  return json({
    challenge,
    rpId: rpIdFromRequest(request),
    allowCredentials: credentials.map((credential) => ({
      type: "public-key",
      id: credential.id,
    })),
    timeout: CHALLENGE_SECONDS * 1000,
    userVerification: "required",
  });
}

async function handleLoginVerify(request: Request, env: AuthEnv, db: D1Database, driveId: string) {
  const credential = (await request.json()) as {
    id: string;
    rawId: string;
    response: {
      clientDataJSON: string;
      authenticatorData: string;
      signature: string;
    };
  };
  const stored = await getCredential(db, driveId, credential.id);
  if (!stored) return json({ error: "Unknown credential" }, { status: 401 });

  const clientData = await parseClientData(credential.response.clientDataJSON, "webauthn.get");
  if (!clientData) return json({ error: "Invalid credential" }, { status: 400 });
  const challenge = await consumeChallenge(db, driveId, clientData.challenge, "get");
  if (!challenge) return json({ error: "Invalid challenge" }, { status: 400 });

  const authenticatorData = base64UrlDecode(credential.response.authenticatorData);
  if (!(await verifyRpAndOrigin(request, clientData, authenticatorData))) {
    return json({ error: "Invalid authenticator data" }, { status: 400 });
  }

  const clientDataHash = await sha256(base64UrlDecode(credential.response.clientDataJSON));
  const signedData = new Uint8Array(authenticatorData.length + clientDataHash.length);
  signedData.set(authenticatorData);
  signedData.set(clientDataHash, authenticatorData.length);

  const key = await crypto.subtle.importKey(
    "jwk",
    stored.publicKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    derEcdsaToRaw(base64UrlDecode(credential.response.signature)),
    signedData
  );
  if (!ok) return json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parseAuthenticatorData(authenticatorData);
  if ((parsed.flags & 0x04) === 0) {
    return json({ error: "User verification is required" }, { status: 401 });
  }
  if (parsed.signCount !== 0 && stored.signCount !== 0 && parsed.signCount <= stored.signCount) {
    return json({ error: "Authenticator sign counter regression" }, { status: 401 });
  }
  await saveCredential(db, driveId, {
    ...stored,
    signCount: Math.max(stored.signCount, parsed.signCount),
    lastUsedAt: Date.now(),
  });

  return json(
    { authenticated: true },
    { headers: { "Set-Cookie": await createSessionCookie(env, stored.user) } }
  );
}

export const onRequest: PagesFunction<AuthEnv> = async function (context) {
  const path = pathFromContext(context);
  let db: D1Database;
  try { db = getDatabase(context.env); }
  catch (error) { return json({ error: (error as Error).message }, { status: 500 }); }
  const driveId = driveIdFromRequest(context.request, context.env);

  if (context.request.method === "GET" && path === "session") {
    return handleStatus(context.request, context.env, db, driveId);
  }
  if (context.request.method === "POST" && path === "login/password") {
    return handlePasswordLogin(context.request, context.env);
  }
  if (context.request.method === "POST" && path === "logout") {
    return json({ authenticated: false }, { headers: { "Set-Cookie": clearSessionCookie() } });
  }
  if (context.request.method === "POST" && path === "passkey/register/options") {
    return handleRegisterOptions(context.request, context.env, db, driveId);
  }
  if (context.request.method === "POST" && path === "passkey/register/verify") {
    return handleRegisterVerify(context.request, context.env, db, driveId);
  }
  if (context.request.method === "POST" && path === "passkey/login/options") {
    return handleLoginOptions(context.request, db, driveId);
  }
  if (context.request.method === "POST" && path === "passkey/login/verify") {
    return handleLoginVerify(context.request, context.env, db, driveId);
  }
  if (context.request.method === "GET" && path === "passkeys") {
    return handleListPasskeys(context.request, context.env, db, driveId);
  }
  if (path.startsWith("passkeys/")) {
    const id = path.slice("passkeys/".length);
    if (context.request.method === "PATCH") {
      return handleRenamePasskey(context.request, context.env, db, driveId, id);
    }
    if (context.request.method === "DELETE") {
      return handleDeletePasskey(context.request, context.env, db, driveId, id);
    }
  }

  return json({ error: "Not found" }, { status: 404 });
};
