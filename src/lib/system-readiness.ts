export type SystemReadinessItem = {
  key: string;
  label: string;
  ready: boolean;
  detail: string;
};

export type SystemReadinessSnapshot = {
  readyCount: number;
  totalCount: number;
  items: SystemReadinessItem[];
};

function hasValue(value: string | undefined) {
  return Boolean(String(value ?? "").trim());
}

export function getSystemReadinessSnapshot(): SystemReadinessSnapshot {
  const smtpReady = Boolean(
    hasValue(process.env.SMTP_USER) &&
      hasValue(process.env.SMTP_PASS) &&
      hasValue(process.env.SMTP_FROM),
  );
  const sheetsReady = Boolean(
    hasValue(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) &&
      hasValue(process.env.GOOGLE_SHEETS_MASTER_ID),
  );

  const attachmentStorageReady = Boolean(
    hasValue(process.env.CLOUDINARY_CLOUD_NAME) &&
      hasValue(process.env.CLOUDINARY_API_KEY) &&
      hasValue(process.env.CLOUDINARY_API_SECRET),
  );

  const entraReady = Boolean(
    hasValue(process.env.AUTH_MICROSOFT_ENTRA_ID_ID) &&
      hasValue(process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET) &&
      hasValue(process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER),
  );
  const firebaseReady = Boolean(
    hasValue(process.env.NEXT_PUBLIC_FIREBASE_API_KEY) &&
      hasValue(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) &&
      hasValue(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) &&
      hasValue(process.env.NEXT_PUBLIC_FIREBASE_APP_ID) &&
      hasValue(process.env.FIREBASE_ADMIN_CLIENT_EMAIL) &&
      hasValue(process.env.FIREBASE_ADMIN_PRIVATE_KEY),
  );
  const employeeSyncConfigured = Boolean(
    hasValue(process.env.GRAPH_TENANT_ID) &&
      hasValue(process.env.GRAPH_CLIENT_ID) &&
      hasValue(process.env.GRAPH_CLIENT_SECRET),
  );
  const employeeSyncEnabled = ["1", "true", "yes", "on"].includes(
    String(process.env.INTUNE_SYNC_ENABLED ?? "").trim().toLowerCase(),
  );
  const employeeDeviceSyncEnabled = ["1", "true", "yes", "on"].includes(
    String(process.env.INTUNE_SYNC_INCLUDE_DEVICES ?? "").trim().toLowerCase(),
  );

  const items: SystemReadinessItem[] = [
    {
      key: "mongodb",
      label: "MongoDB",
      ready: true,
      detail: "Current admin page is already reading the live database.",
    },
    {
      key: "smtp",
      label: "SMTP",
      ready: smtpReady,
      detail: smtpReady
        ? "SMTP_USER, SMTP_PASS, and SMTP_FROM are set."
        : "Missing one or more of SMTP_USER, SMTP_PASS, or SMTP_FROM.",
    },
    {
      key: "google-sheets",
      label: "Google Sheets",
      ready: sheetsReady,
      detail: sheetsReady
        ? "Service account key path and master spreadsheet ID are set."
        : "Missing GOOGLE_SERVICE_ACCOUNT_KEY_PATH or GOOGLE_SHEETS_MASTER_ID.",
    },
    {
      key: "cloudinary",
      label: "Cloudinary",
      ready: attachmentStorageReady,
      detail: attachmentStorageReady
        ? "Cloudinary cloud name, API key, and API secret are set for attachments."
        : "Missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET.",
    },
    {
      key: "auth",
      label: "Authentication",
      ready: entraReady || firebaseReady,
      detail: entraReady && firebaseReady
        ? "Microsoft Entra ID and Firebase Authentication are configured."
        : entraReady
          ? "Microsoft Entra ID credentials are configured."
          : firebaseReady
            ? "Firebase Authentication is configured."
            : "Microsoft Entra ID and Firebase Authentication are incomplete.",
    },
    {
      key: "employee-sync",
      label: "Employee sync",
      ready: employeeSyncConfigured && employeeSyncEnabled,
      detail: employeeSyncConfigured
        ? employeeSyncEnabled
          ? employeeDeviceSyncEnabled
            ? "Microsoft Graph employee sync is configured and Intune device summaries are enabled."
            : "Microsoft Graph employee sync is configured. Intune device summaries are optional and currently off."
          : "Microsoft Graph credentials are set, but INTUNE_SYNC_ENABLED is still off."
        : "Missing GRAPH_TENANT_ID, GRAPH_CLIENT_ID, or GRAPH_CLIENT_SECRET for employee sync."
    },
  ];

  return {
    readyCount: items.filter((item) => item.ready).length,
    totalCount: items.length,
    items,
  };
}
