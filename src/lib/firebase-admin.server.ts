/**
 * Edge-safe Firebase Admin replacement.
 *
 * The official `firebase-admin` package needs a Node host (gRPC + native deps)
 * and cannot run in this serverless runtime, so this module talks to Google
 * directly:
 *  - verifies Firebase ID tokens against Google's public JWK set
 *  - mints a service-account OAuth2 access token (RS256, Web Crypto via jose)
 *  - performs Firestore REST reads/writes with that token
 *
 * Every value here comes from server-side env vars. Nothing is ever returned
 * to the browser.
 */
import { SignJWT, createRemoteJWKSet, importPKCS8, jwtVerify } from "jose";

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function getServiceAccount(): ServiceAccount {
  const raw = process.env['FIREBASE_SERVICE_ACCOUNT'];
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT");
  const parsed = JSON.parse(raw) as ServiceAccount;
  return { ...parsed, private_key: parsed.private_key.replace(/\\n/g, "\n") };
}

export function getProjectId(): string {
  return process.env['FIREBASE_PROJECT_ID'] ?? getServiceAccount().project_id;
}

/** Verifies a Firebase ID token and returns the caller's uid. */
export async function verifyIdToken(authorization: string | null): Promise<string> {
  const token = authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("unauthorized");
  const projectId = getProjectId();
  const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  const uid = (payload.sub ?? payload['user_id']) as string | undefined;
  if (!uid) throw new Error("unauthorized");
  return uid;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const sa = getServiceAccount();
  const key = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/datastore",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

/* ------------------------------ value codecs ------------------------------ */

type FsValue = Record<string, unknown>;

function encodeValue(value: unknown): FsValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeValue) } };
  }
  return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
}

export function encodeFields(obj: Record<string, unknown>): Record<string, FsValue> {
  const out: Record<string, FsValue> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = encodeValue(v);
  return out;
}

function decodeValue(value: FsValue): unknown {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value['booleanValue'];
  if ("integerValue" in value) return Number(value['integerValue']);
  if ("doubleValue" in value) return Number(value['doubleValue']);
  if ("stringValue" in value) return value['stringValue'];
  if ("timestampValue" in value) return value['timestampValue'];
  if ("arrayValue" in value) {
    const arr = (value['arrayValue'] as { values?: FsValue[] }).values ?? [];
    return arr.map(decodeValue);
  }
  if ("mapValue" in value) {
    return decodeFields((value['mapValue'] as { fields?: Record<string, FsValue> }).fields ?? {});
  }
  return null;
}

export function decodeFields(fields: Record<string, FsValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
  return out;
}

/* ------------------------------ Firestore REST ---------------------------- */

function baseUrl() {
  return `https://firestore.googleapis.com/v1/projects/${getProjectId()}/databases/(default)/documents`;
}

async function fsFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });
  return res;
}

export async function getDocument(path: string): Promise<Record<string, unknown> | null> {
  const res = await fsFetch(`/${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore read failed: ${await res.text()}`);
  const json = (await res.json()) as { fields?: Record<string, FsValue> };
  return decodeFields(json.fields ?? {});
}

/** Patch (merge) specific fields of a document. */
export async function updateDocument(path: string, data: Record<string, unknown>) {
  const mask = Object.keys(data)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  const res = await fsFetch(`/${path}?${mask}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
  if (!res.ok) throw new Error(`Firestore write failed: ${await res.text()}`);
}

/** Simple single-collection equality query. */
export async function queryCollection(
  collection: string,
  field: string,
  value: unknown,
  limit = 10,
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl()}:runQuery`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: encodeValue(value) },
        },
        limit,
      },
    }),
  });
  if (!res.ok) throw new Error(`Firestore query failed: ${await res.text()}`);
  const rows = (await res.json()) as Array<{
    document?: { name: string; fields?: Record<string, FsValue> };
  }>;
  return rows
    .filter((r) => r.document)
    .map((r) => ({
      id: r.document!.name.split("/").pop()!,
      data: decodeFields(r.document!.fields ?? {}),
    }));
}

export async function createDocument(
  collectionPath: string,
  data: Record<string, unknown>,
  docId?: string,
) {
  const query = docId ? `?documentId=${encodeURIComponent(docId)}` : "";
  const res = await fsFetch(`/${collectionPath}${query}`, {
    method: "POST",
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
  if (!res.ok) throw new Error(`Firestore create failed: ${await res.text()}`);
  const json = (await res.json()) as { name: string };
  return json.name.split("/").pop()!;
}

/* ------------------------------ IST helpers ------------------------------- */

/** Current calendar date in IST as YYYY-MM-DD. */
export function istToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
