import { uploadToDriveFolder } from "@/lib/google/drive";

export type AttachmentUploadResult = {
  id: string;
  name?: string;
  webViewLink?: string;
  webContentLink?: string;
  provider: "drive";
};

function normalizeFolderSegment(input?: string) {
  return String(input ?? "").trim().replace(/^\/+|\/+$/g, "");
}

export async function uploadAttachment(opts: {
  folder?: string;
  requestReference?: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}) {
  const folderPath = [normalizeFolderSegment(opts.folder), normalizeFolderSegment(opts.requestReference)].filter(
    Boolean
  );

  const uploaded = await uploadToDriveFolder({
    folderPath,
    fileName: opts.fileName,
    mimeType: opts.mimeType || "application/octet-stream",
    bytes: opts.bytes,
  });

  return {
    id: uploaded.id,
    name: uploaded.name || opts.fileName,
    webViewLink: uploaded.webViewLink || "",
    webContentLink: uploaded.webContentLink || "",
    provider: "drive" as const,
  } satisfies AttachmentUploadResult;
}
