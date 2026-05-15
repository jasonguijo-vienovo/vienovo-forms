import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const SCREENSHOT_BYPASS_COOKIE = "vienovo_screenshot_bypass";
const OUTPUT_DIR = path.resolve(process.cwd(), "tmp", "slides", "screenshots");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");

async function readPrimaryAdminEmail() {
  try {
    const content = await fs.readFile(path.resolve(process.cwd(), ".env"), "utf8");
    const line = content
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith("ADMIN_EMAILS="));
    const first = line?.replace(/^ADMIN_EMAILS=/, "").split(",")[0]?.trim().toLowerCase();
    return first || "jerome.corpus@vienovo.ph";
  } catch {
    return "jerome.corpus@vienovo.ph";
  }
}

function route(label, slug, url, opts = {}) {
  return { label, slug, url, ...opts };
}

async function buildRoutes() {
  const adminEmail = await readPrimaryAdminEmail();
  const encodedAdminEmail = encodeURIComponent(adminEmail);

  return [
    route("Sign In", "01-sign-in", "/sign-in", { auth: false }),
    route("Dashboard", "02-dashboard", "/dashboard"),
    route("Forms Catalog", "03-forms-catalog", "/forms"),
    route("Travel Booking Form", "04-travel-booking-form", "/forms/travel-booking"),
    route("Cash Advance Form", "05-cash-advance-form", "/forms/cash-advance"),
    route("Reimbursement Form", "06-reimbursement-form", "/forms/reimbursement"),
    route("Imported Form Admin View", "07-imported-form-admin", "/forms/fixed-assets-release"),
    route("Imported Form Requester Preview", "08-imported-form-requester", "/forms/fixed-assets-release?preview=requester"),
    route("Approvals Workspace", "09-approvals", "/approvals"),
    route("Request Detail Pending", "10-request-detail-pending", "/requests/TRV-2026-0001"),
    route("Request Approval Action", "11-request-approve", "/requests/TRV-2026-0001/approve"),
    route("Request Detail Returned", "12-request-detail-returned", "/requests/TRV-2026-0002"),
    route("Request Edit Returned", "13-request-edit-returned", "/requests/TRV-2026-0002/edit"),
    route("Request Detail Approved", "14-request-detail-approved", "/requests/CA-2026-0001"),
    route("Request Detail Rejected", "15-request-detail-rejected", "/requests/RMB-2026-0001"),
    route("Request Detail Imported Submitted", "16-request-detail-imported", "/requests/IMP-2026-0001"),
    route("Request Detail Needs Processor", "17-request-detail-needs-processor", "/requests/RMB-2026-0002"),
    route("Admin Overview", "18-admin-overview", "/admin"),
    route("Admin Settings", "19-admin-settings", "/admin/settings"),
    route("Forms Registry", "20-admin-forms-registry", "/admin/forms"),
    route("Form Importer", "21-admin-form-importer", "/admin/form-imports"),
    route("Form Importer Manage", "22-admin-form-importer-manage", "/admin/form-imports?tab=manage"),
    route("Manage Dropdowns", "23-admin-lookups", "/admin/lookups"),
    route("Approvers Admin", "24-admin-approvers", "/admin/approvers"),
    route("Processors Admin", "25-admin-processors", "/admin/processors"),
    route("User Info List", "26-admin-users", "/admin/users"),
    route("User Info Detail", "27-admin-user-detail", `/admin/users/${encodedAdminEmail}`),
    route("User Roles", "28-admin-user-roles", "/admin/user-roles"),
    route("Notification Flow", "29-admin-notifications", "/admin/notifications"),
    route("Admin Jobs", "30-admin-jobs", "/admin/jobs"),
    route("Reimbursement Routing", "31-admin-reimbursement-routing", "/admin/reimbursement-routing"),
    route("Admin Queue", "32-admin-requests", "/admin/requests"),
    route("Admin Queue Pending Approval", "33-admin-requests-pending-approval", "/admin/requests?view=pending-approval"),
    route("Admin Queue Needs Processor", "34-admin-requests-needs-processor", "/admin/requests?view=needs-processor"),
    route("Admin Queue Returned", "35-admin-requests-returned", "/admin/requests?status=returned"),
  ];
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

async function captureOne(page, entry) {
  const targetUrl = new URL(entry.url, BASE_URL).toString();
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const html = await page.content();
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const title = await page.title();
  const heading = await page
    .locator("h1")
    .first()
    .textContent()
    .catch(() => "");

  const filePath = path.join(OUTPUT_DIR, `${entry.slug}.png`);
  await page.screenshot({ path: filePath, fullPage: true });

  return {
    label: entry.label,
    slug: entry.slug,
    url: targetUrl,
    auth: entry.auth !== false,
    title,
    heading: String(heading ?? "").trim(),
    containsInternalServerError: bodyText.includes("Internal Server Error") || html.includes("Internal Server Error"),
    filePath,
  };
}

async function main() {
  await ensureOutputDir();

  const routes = await buildRoutes();
  const browser = await chromium.launch({ headless: true });
  const base = new URL(BASE_URL);

  const guestContext = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
  });
  const authContext = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
  });

  await authContext.addCookies([
    {
      name: SCREENSHOT_BYPASS_COOKIE,
      value: "1",
      domain: base.hostname,
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  const guestPage = await guestContext.newPage();
  const authPage = await authContext.newPage();
  const manifest = [];

  for (const entry of routes) {
    const page = entry.auth === false ? guestPage : authPage;
    const result = await captureOne(page, entry);
    manifest.push(result);
    console.log(`${result.slug} :: ${result.containsInternalServerError ? "error" : "ok"}`);
  }

  await fs.writeFile(
    MANIFEST_PATH,
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        generatedAt: new Date().toISOString(),
        screenshots: manifest,
      },
      null,
      2,
    ),
    "utf8",
  );

  await guestContext.close();
  await authContext.close();
  await browser.close();

  console.log(MANIFEST_PATH);
}

await main();
