import crypto from "crypto";
import { readFile } from "fs/promises";

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

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

async function getServiceAccountAccessToken() {
  const creds = await loadServiceAccountCredentials();
  const clientEmail = creds.clientEmail;
  const privateKey = creds.privateKey;

  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwtRS256(
    {
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/drive.file",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 60 * 60,
    },
    privateKey
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

export type DriveUploadResult = {
  id: string;
  name?: string;
  webViewLink?: string;
  webContentLink?: string;
};

export async function uploadToDriveFolder(opts: {
  folderId?: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}) {
  const folderId = opts.folderId ?? requiredEnv("GOOGLE_DRIVE_TRAVEL_BOOKING_FOLDER_ID");
  const accessToken = await getServiceAccountAccessToken();

  const boundary = `vienovoForms_${crypto.randomUUID()}`;
  const metadata = {
    name: opts.fileName,
    parents: [folderId],
  };

  const preamble =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${opts.mimeType || "application/octet-stream"}\r\n\r\n`;
  const epilogue = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(preamble, "utf8"), opts.bytes, Buffer.from(epilogue, "utf8")]);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Drive upload error (${res.status}): ${text || res.statusText}`);
  }

  return (await res.json()) as DriveUploadResult;
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
