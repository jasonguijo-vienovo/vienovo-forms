import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import mongoose from "mongoose";

const args = new Set(process.argv.slice(2));
const shouldStartServer = args.has("--start-server");
const baseUrl = process.env.HEALTH_BASE_URL || "http://127.0.0.1:3000";
const results = [];

function addResult(name, ok, details) {
  results.push({ name, ok, details });
  const icon = ok ? "PASS" : "FAIL";
  console.log(`[${icon}] ${name}: ${details}`);
}

function parseEnvFile(content) {
  const output = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      output[key] = value;
    }
  }
  return output;
}

function loadLocalEnv() {
  const candidates = [".env.local", ".env"];
  for (const name of candidates) {
    const file = join(process.cwd(), name);
    if (!existsSync(file)) continue;
    const parsed = parseEnvFile(readFileSync(file, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

function portFromBaseUrl(url) {
  const parsed = new URL(url);
  if (parsed.port) return Number(parsed.port);
  return parsed.protocol === "https:" ? 443 : 80;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 45_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) return true;
    } catch {}
    await sleep(1000);
  }
  return false;
}

function stopServer(processRef) {
  if (!processRef || processRef.killed) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(processRef.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      processRef.kill("SIGTERM");
    }
  } catch {}
}

async function checkDbConnectivity() {
  loadLocalEnv();
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    addResult("DB connectivity", false, "MONGODB_URI is not set");
    return;
  }

  try {
    await mongoose.connect(mongoUri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 7000,
    });
    await mongoose.connection.db.admin().command({ ping: 1 });
    addResult("DB connectivity", true, "MongoDB ping succeeded");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addResult("DB connectivity", false, message);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

async function fetchRoute(pathname) {
  const url = `${baseUrl}${pathname}`;
  const response = await fetch(url, { redirect: "manual" });
  const body = await response.text();
  return {
    url,
    status: response.status,
    location: response.headers.get("location") || "",
    body,
    contentType: response.headers.get("content-type") || "",
  };
}

async function checkAppRoutes() {
  const checks = ["/", "/sign-in"];
  for (const route of checks) {
    try {
      const res = await fetchRoute(route);
      const ok = res.status >= 200 && res.status < 400;
      addResult(`Route ${route}`, ok, `status ${res.status}`);
    } catch (error) {
      addResult(`Route ${route}`, false, String(error));
    }
  }
}

async function checkAuthEndpoints() {
  try {
    const session = await fetchRoute("/api/auth/session");
    if (session.status !== 200) {
      addResult("Auth session endpoint", false, `status ${session.status}`);
      return;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(session.body);
    } catch {
      addResult("Auth session endpoint", false, "response is not valid JSON");
      return;
    }

    const validPayload = parsed === null || typeof parsed === "object";
    addResult(
      "Auth session endpoint",
      validPayload,
      validPayload ? "session JSON is valid" : "session payload is invalid",
    );
  } catch (error) {
    addResult("Auth session endpoint", false, String(error));
  }

  try {
    const csrf = await fetchRoute("/api/auth/csrf");
    if (csrf.status !== 200) {
      addResult("Auth csrf endpoint", false, `status ${csrf.status}`);
      return;
    }
    const parsed = JSON.parse(csrf.body);
    const ok = typeof parsed?.csrfToken === "string" && parsed.csrfToken.length > 0;
    addResult("Auth csrf endpoint", ok, ok ? "csrf token available" : "csrf token missing");
  } catch (error) {
    addResult("Auth csrf endpoint", false, String(error));
  }
}

async function checkFormFlowReadiness() {
  const routes = ["/forms", "/forms/cash-advance", "/forms/reimbursement"];
  for (const route of routes) {
    try {
      const res = await fetchRoute(route);
      const redirectedToSignIn =
        (res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308) &&
        res.location.includes("/sign-in");
      const bodyLower = res.body.toLowerCase();
      const authGatePage =
        res.status === 200 &&
        (bodyLower.includes("sign in") || bodyLower.includes("/sign-in"));
      const pageRendered = res.status === 200;
      const ok = redirectedToSignIn || authGatePage || pageRendered;
      const details = redirectedToSignIn
        ? `auth redirect works (${res.status} -> ${res.location})`
        : authGatePage
          ? "auth gate page rendered"
          : pageRendered
          ? "route responded with 200"
          : `unexpected response status ${res.status}`;
      addResult(`Form flow ${route}`, ok, details);
    } catch (error) {
      addResult(`Form flow ${route}`, false, String(error));
    }
  }
}

async function run() {
  let serverProcess = null;
  try {
    if (shouldStartServer) {
      const port = portFromBaseUrl(baseUrl);
      const startCommand =
        process.platform === "win32"
          ? `npm run start -- -p ${port}`
          : `npm run start -- -p ${port}`;
      serverProcess = spawn(startCommand, {
        cwd: process.cwd(),
        shell: true,
        stdio: "ignore",
      });
      const ready = await waitForServer(`${baseUrl}/sign-in`);
      if (!ready) {
        addResult("Server startup", false, `timed out waiting for ${baseUrl}`);
      } else {
        addResult("Server startup", true, `${baseUrl} is reachable`);
      }
    }

    await checkAppRoutes();
    await checkAuthEndpoints();
    await checkDbConnectivity();
    await checkFormFlowReadiness();
  } finally {
    stopServer(serverProcess);
  }

  const failed = results.filter((item) => !item.ok);
  console.log("");
  if (failed.length === 0) {
    console.log("System health check passed.");
    process.exitCode = 0;
    return;
  }

  console.log(`System health check failed: ${failed.length} check(s) failed.`);
  process.exitCode = 1;
}

run().catch((error) => {
  console.error("Health check crashed:", error);
  process.exitCode = 1;
});
