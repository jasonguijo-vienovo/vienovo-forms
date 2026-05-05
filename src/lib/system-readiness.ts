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

  const driveFolderIds = [
    process.env.GOOGLE_DRIVE_TRAVEL_BOOKING_FOLDER_ID,
    process.env.GOOGLE_DRIVE_CASH_ADVANCE_FOLDER_ID,
    process.env.GOOGLE_DRIVE_REIMBURSEMENT_FOLDER_ID,
  ].filter((value) => hasValue(value));
  const driveReady = driveFolderIds.length === 3;

  const entraReady = Boolean(
    process.env.AUTH_DEV_BYPASS === "1" ||
      (hasValue(process.env.AUTH_MICROSOFT_ENTRA_ID_ID) &&
        hasValue(process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET) &&
        hasValue(process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER)),
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
      key: "google-drive",
      label: "Google Drive",
      ready: driveReady,
      detail: driveReady
        ? "Travel, cash advance, and reimbursement folders are all configured."
        : `${driveFolderIds.length}/3 Drive folders are configured for attachments.`,
    },
    {
      key: "auth",
      label: "Authentication",
      ready: entraReady,
      detail:
        process.env.AUTH_DEV_BYPASS === "1"
          ? "Dev bypass is active."
          : entraReady
            ? "Microsoft Entra ID credentials are configured."
            : "Microsoft Entra ID is incomplete and dev bypass is off.",
    },
  ];

  return {
    readyCount: items.filter((item) => item.ready).length,
    totalCount: items.length,
    items,
  };
}
