import fs from "fs";
import path from "path";
import { db, appConfig } from "@workspace/db";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

export async function restoreConfigToDisk(): Promise<void> {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const rows = await db.select().from(appConfig);
    const dbKeys = new Set<string>();
    for (const row of rows) {
      dbKeys.add(row.key);
      try {
        fs.writeFileSync(
          path.join(DATA_DIR, row.key),
          JSON.stringify(row.value, null, 2),
        );
      } catch {}
    }
    for (const file of fs.readdirSync(DATA_DIR)) {
      if (!file.endsWith(".json") || dbKeys.has(file)) continue;
      try {
        const full = path.join(DATA_DIR, file);
        if (!fs.statSync(full).isFile()) continue;
        const data = JSON.parse(fs.readFileSync(full, "utf8"));
        await db
          .insert(appConfig)
          .values({ key: file, value: data })
          .onConflictDoUpdate({ target: appConfig.key, set: { value: data } });
      } catch {}
    }
    console.log(`[configStore] restored ${dbKeys.size} config keys from database`);
  } catch (err) {
    // Don't crash the server (the dashboard must stay reachable), but make the
    // failure loud — a failed restore silently regresses to "re-login required".
    console.error(
      "[configStore] RESTORE FAILED — credentials/sessions may not have loaded:",
      (err as Error).message,
    );
  }
}

// Coalesced, ordered, retrying write-through. writeJSON is synchronous and called
// from many places, so persistConfig stays fire-and-forget — but a single flusher
// drains the latest value per key with retries so credential/session writes are
// not silently lost (last-write-wins per key is preserved).
const dirty = new Map<string, any>();
let flushing = false;

export function persistConfig(file: string, data: any): void {
  dirty.set(file, data);
  void flush();
}

async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    while (dirty.size) {
      const [key, value] = dirty.entries().next().value as [string, any];
      dirty.delete(key);
      try {
        await db
          .insert(appConfig)
          .values({ key, value })
          .onConflictDoUpdate({
            target: appConfig.key,
            set: { value, updatedAt: new Date() },
          });
      } catch (err) {
        console.error(
          `[configStore] persist failed for ${key}, retrying:`,
          (err as Error).message,
        );
        // Re-queue only if a newer write hasn't already superseded this one.
        if (!dirty.has(key)) dirty.set(key, value);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  } finally {
    flushing = false;
  }
}
