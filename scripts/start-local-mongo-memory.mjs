import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { MongoMemoryServer } from "mongodb-memory-server";

const OUTPUT_DIR = path.resolve(process.cwd(), ".codex-tmp");
const INFO_PATH = path.join(OUTPUT_DIR, "mongo-memory.json");

await fs.mkdir(OUTPUT_DIR, { recursive: true });

const server = await MongoMemoryServer.create({
  instance: {
    port: 27018,
    dbName: "vienovo_forms",
    ip: "127.0.0.1",
    launchTimeout: 120000,
  },
  spawn: {
    windowsHide: true,
  },
});

const payload = {
  uri: server.getUri(),
  port: 27018,
  pid: process.pid,
  startedAt: new Date().toISOString(),
};

await fs.writeFile(INFO_PATH, JSON.stringify(payload, null, 2), "utf8");
console.log(JSON.stringify(payload));

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await new Promise(() => {});
