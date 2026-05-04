import crypto from "crypto";
import { readFile } from "fs/promises";

function base64UrlEncode(input: Buffer | string) {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwtRS256(payload: Record<string, unknown>, privateKeyPem: string) {
  const header = { alg: "RS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(data);
  signer.end();
  const signature = signer.sign(privateKeyPem);
  return `${data}.${base64UrlEncode(signature)}`;
}

async function loadServiceAccountCredentials(): Promise<{ clientEmail: string; privateKey: string }> {
  const directEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const directKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (directEmail && directKey) {
    return {
      clientEmail: directEmail,
      privateKey: directKey.replace(/\\n/g, "\n"),
    };
  }

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyPath) {
    throw new Error(
      "Missing service account credentials. Set GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, or GOOGLE_SERVICE_ACCOUNT_KEY_PATH."
    );
  }

  const raw = await readFile(keyPath, "utf8");
  const json = JSON.parse(raw) as { client_email?: string; private_key?: string };
  if (!json.client_email || !json.private_key) {
    throw new Error("Invalid service account key file. Expected client_email and private_key.");
  }

  return { clientEmail: json.client_email, privateKey: json.private_key };
}

async function getServiceAccountAccessToken(scope: string) {
  const creds = await loadServiceAccountCredentials();
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwtRS256(
    {
      iss: creds.clientEmail,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 60 * 60,
    },
    creds.privateKey
  );

  const body = new URLSearchParams();
  body.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  body.set("assertion", assertion);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google OAuth token error (${res.status}): ${text || res.statusText}`);
  }

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google OAuth token error: missing access_token");
  return json.access_token;
}

async function authorizedSheetsFetch(path: string) {
  const accessToken = await getServiceAccountAccessToken(
    "https://www.googleapis.com/auth/spreadsheets.readonly"
  );

  const res = await fetch(`https://sheets.googleapis.com/v4/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Sheets error (${res.status}): ${text || res.statusText}`);
  }

  return res;
}

export async function listSpreadsheetSheets(spreadsheetId: string): Promise<string[]> {
  const res = await authorizedSheetsFetch(
    `spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`
  );
  const json = (await res.json()) as {
    sheets?: Array<{ properties?: { title?: string } }>;
  };

  return (json.sheets ?? [])
    .map((sheet) => sheet.properties?.title?.trim() ?? "")
    .filter(Boolean);
}

export async function readSpreadsheetMatrix(
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  const res = await authorizedSheetsFetch(
    `spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`
  );
  const json = (await res.json()) as { values?: string[][] };

  return (json.values ?? []).map((row) => row.map((cell) => String(cell ?? "").trim()));
}

export async function readSpreadsheetRange(spreadsheetId: string, range: string): Promise<string[]> {
  const values = await readSpreadsheetMatrix(spreadsheetId, range);

  return values
    .map((row) => String(row?.[0] ?? "").trim())
    .filter(Boolean);
}
