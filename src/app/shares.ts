export type ShareStatus = "active" | "expired" | "revoked" | "invalid";

export type ShareRecord = {
  id: string;
  path: string;
  token: string;
  objectVersion: string;
  createdAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
  status: ShareStatus;
  url: string;
};

async function shareFetch(path = "", init?: RequestInit) {
  const response = await fetch(`/api/shares${path}`, {
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
    throw new Error(message || "Share request failed");
  }
  return response;
}

export async function getShare(path: string) {
  const response = await shareFetch(`?path=${encodeURIComponent(path)}`);
  return response.json() as Promise<{ share: ShareRecord | null }>;
}

export async function listShares(cursor?: string) {
  const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const response = await shareFetch(suffix);
  return response.json() as Promise<{ shares: ShareRecord[]; cursor: string | null }>;
}

export async function createShare(path: string, expiresAt: number | null) {
  const response = await shareFetch("", {
    method: "POST",
    body: JSON.stringify({ path, expiresAt }),
  });
  return response.json() as Promise<{ share: ShareRecord }>;
}

export async function updateShare(id: string, expiresAt: number | null) {
  const response = await shareFetch(`/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ expiresAt }),
  });
  return response.json() as Promise<{ share: ShareRecord }>;
}

export async function revokeShare(id: string) {
  const response = await shareFetch(`/${encodeURIComponent(id)}`, { method: "DELETE" });
  return response.json() as Promise<{ share: ShareRecord }>;
}
