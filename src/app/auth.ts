export type AuthSession = {
  authenticated: boolean;
  passkeyAvailable: boolean;
};

export type PasskeySummary = {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
};

type RegistrationOptions = Omit<PublicKeyCredentialCreationOptions, "challenge" | "user"> & {
  challenge: string;
  user: Omit<PublicKeyCredentialUserEntity, "id"> & { id: string };
};

type LoginOptions = Omit<PublicKeyCredentialRequestOptions, "challenge" | "allowCredentials"> & {
  challenge: string;
  allowCredentials: Array<Omit<PublicKeyCredentialDescriptor, "id"> & { id: string }>;
};

function base64UrlToBuffer(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function authFetch(path: string, init?: RequestInit) {
  const response = await fetch(`/auth/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const message = await response
      .json()
      .then((body) => (body as { error?: string }).error)
      .catch(() => response.statusText);
    throw new Error(message || "Authentication failed");
  }
  return response;
}

function credentialToJSON(credential: PublicKeyCredential) {
  const response = credential.response;
  const json: Record<string, unknown> = {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
  };

  if (response instanceof AuthenticatorAttestationResponse) {
    json.response = {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      attestationObject: bufferToBase64Url(response.attestationObject),
    };
  } else if (response instanceof AuthenticatorAssertionResponse) {
    json.response = {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      authenticatorData: bufferToBase64Url(response.authenticatorData),
      signature: bufferToBase64Url(response.signature),
      userHandle: response.userHandle ? bufferToBase64Url(response.userHandle) : null,
    };
  }

  return json;
}

export async function getAuthSession(): Promise<AuthSession> {
  const response = await authFetch("session");
  return response.json();
}

export async function passwordLogin(username: string, password: string, totp: string) {
  await authFetch("login/password", {
    method: "POST",
    body: JSON.stringify({ username, password, totp }),
  });
}

export async function logout() {
  await authFetch("logout", { method: "POST" });
}

export async function registerPasskey(name?: string) {
  if (!window.PublicKeyCredential) throw new Error("Passkeys are not supported by this browser");

  const options = (await authFetch("passkey/register/options", { method: "POST" }).then((res) =>
    res.json()
  )) as RegistrationOptions;
  const credential = (await navigator.credentials.create({
    publicKey: {
      ...options,
      challenge: base64UrlToBuffer(options.challenge),
      user: { ...options.user, id: base64UrlToBuffer(options.user.id) },
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("Passkey registration was cancelled");
  await authFetch("passkey/register/verify", {
    method: "POST",
    body: JSON.stringify({ ...credentialToJSON(credential), name }),
  });
}

export async function listPasskeys() {
  const response = await authFetch("passkeys");
  return response.json() as Promise<{ passkeys: PasskeySummary[] }>;
}

export async function renamePasskey(id: string, name: string) {
  const response = await authFetch(`passkeys/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  return response.json() as Promise<{ passkey: PasskeySummary }>;
}

export async function deletePasskey(id: string) {
  await authFetch(`passkeys/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function passkeyLogin() {
  if (!window.PublicKeyCredential) throw new Error("Passkeys are not supported by this browser");

  const options = (await authFetch("passkey/login/options", { method: "POST" }).then((res) =>
    res.json()
  )) as LoginOptions;
  const credential = (await navigator.credentials.get({
    publicKey: {
      ...options,
      challenge: base64UrlToBuffer(options.challenge),
      allowCredentials: options.allowCredentials.map((credential) => ({
        ...credential,
        id: base64UrlToBuffer(credential.id),
      })),
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("Passkey sign in was cancelled");
  await authFetch("passkey/login/verify", {
    method: "POST",
    body: JSON.stringify(credentialToJSON(credential)),
  });
}

export function webdavFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, {
    ...init,
    headers: {
      ...init?.headers,
      "X-FlareDrive-Web-Auth": "1",
    },
  });
}
