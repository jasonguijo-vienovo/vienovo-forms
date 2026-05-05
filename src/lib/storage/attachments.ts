import crypto from "crypto";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function sha1Hex(input: string) {
  return crypto.createHash("sha1").update(input).digest("hex");
}

function buildFolderPath(folder?: string) {
  const base = process.env.CLOUDINARY_UPLOAD_FOLDER?.trim() || "vienovo-forms";
  const suffix = String(folder || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  return suffix ? `${base}/${suffix}` : base;
}

export type AttachmentUploadResult = {
  id: string;
  name?: string;
  webViewLink?: string;
  webContentLink?: string;
  secureUrl?: string;
  publicId?: string;
  provider: "cloudinary";
};

export async function uploadAttachment(opts: {
  folder?: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}) {
  const cloudName = requiredEnv("CLOUDINARY_CLOUD_NAME");
  const apiKey = requiredEnv("CLOUDINARY_API_KEY");
  const apiSecret = requiredEnv("CLOUDINARY_API_SECRET");
  const folder = buildFolderPath(opts.folder);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const signature = sha1Hex(`folder=${folder}&timestamp=${timestamp}${apiSecret}`);

  const form = new FormData();
  form.set("api_key", apiKey);
  form.set("timestamp", timestamp);
  form.set("signature", signature);
  form.set("folder", folder);
  const binary = new Uint8Array(opts.bytes);
  form.set("file", new Blob([binary], { type: opts.mimeType || "application/octet-stream" }), opts.fileName);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Cloudinary upload error (${res.status}): ${text || res.statusText}`);
  }

  const json = (await res.json()) as {
    public_id?: string;
    secure_url?: string;
    url?: string;
    original_filename?: string;
  };

  return {
    id: json.public_id || "",
    name: json.original_filename || opts.fileName,
    webViewLink: json.secure_url || json.url || "",
    webContentLink: json.secure_url || json.url || "",
    secureUrl: json.secure_url || json.url || "",
    publicId: json.public_id || "",
    provider: "cloudinary" as const,
  } satisfies AttachmentUploadResult;
}
