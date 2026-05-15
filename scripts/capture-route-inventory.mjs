import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUTPUT_DIR = path.resolve(process.cwd(), "tmp", "slides", "inventory");
const INVENTORY_PATH = path.join(OUTPUT_DIR, "route-inventory.json");
const SCREENSHOT_BYPASS_COOKIE = "vienovo_screenshot_bypass";

const SEED_URLS = [
  "/dashboard",
  "/forms",
  "/approvals",
  "/admin",
  "/admin/settings",
  "/admin/forms",
  "/admin/form-imports",
  "/admin/lookups",
  "/admin/approvers",
  "/admin/processors",
  "/admin/users",
  "/admin/user-roles",
  "/admin/notifications",
  "/admin/jobs",
  "/admin/reimbursement-routing",
  "/admin/requests",
];

function normalizeUrl(input) {
  const url = new URL(input, BASE_URL);
  if (url.origin !== new URL(BASE_URL).origin) return null;
  if (url.hash) url.hash = "";
  return url.toString();
}

function shouldVisit(urlString) {
  const url = new URL(urlString);
  const pathname = url.pathname;

  if (pathname === "/sign-in") return true;
  if (pathname.startsWith("/dashboard")) return true;
  if (pathname.startsWith("/forms")) return true;
  if (pathname.startsWith("/approvals")) return true;
  if (pathname.startsWith("/requests")) return true;
  if (pathname.startsWith("/admin")) return true;

  return false;
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

async function collectPageMetadata(page, url) {
  const result = await page.evaluate(() => {
    const heading =
      document.querySelector("h1")?.textContent?.trim() ||
      document.querySelector("[data-page-title]")?.textContent?.trim() ||
      "";

    const links = Array.from(document.querySelectorAll("a[href]")).map((anchor) => ({
      href: anchor.href,
      text: anchor.textContent?.replace(/\s+/g, " ").trim() || "",
    }));

    return {
      title: document.title,
      heading,
      links,
    };
  });

  return {
    url,
    title: result.title,
    heading: result.heading,
    links: result.links,
  };
}

async function main() {
  await ensureOutputDir();

  const browser = await chromium.launch({ headless: true });
  const base = new URL(BASE_URL);

  const guestContext = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  const authContext = await browser.newContext({
    viewport: { width: 1440, height: 960 },
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
  await guestPage.goto(`${BASE_URL}/sign-in`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await guestPage.waitForTimeout(1000);
  const signInMetadata = await collectPageMetadata(guestPage, `${BASE_URL}/sign-in`);

  const page = await authContext.newPage();
  const queue = [...SEED_URLS.map((value) => normalizeUrl(value)).filter(Boolean)];
  const visited = new Set();
  const pages = [signInMetadata];

  while (queue.length > 0 && visited.size < 200) {
    const nextUrl = queue.shift();
    if (!nextUrl || visited.has(nextUrl) || !shouldVisit(nextUrl)) continue;

    visited.add(nextUrl);

    try {
      await page.goto(nextUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(1200);
      const metadata = await collectPageMetadata(page, nextUrl);
      pages.push(metadata);

      for (const link of metadata.links) {
        const normalized = normalizeUrl(link.href);
        if (!normalized || visited.has(normalized) || !shouldVisit(normalized)) continue;
        if (!queue.includes(normalized)) {
          queue.push(normalized);
        }
      }
    } catch (error) {
      pages.push({
        url: nextUrl,
        title: "",
        heading: "",
        error: error instanceof Error ? error.message : String(error),
        links: [],
      });
    }
  }

  await fs.writeFile(
    INVENTORY_PATH,
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        generatedAt: new Date().toISOString(),
        pageCount: pages.length,
        pages,
      },
      null,
      2,
    ),
    "utf8",
  );

  await guestContext.close();
  await authContext.close();
  await browser.close();

  console.log(INVENTORY_PATH);
}

await main();
