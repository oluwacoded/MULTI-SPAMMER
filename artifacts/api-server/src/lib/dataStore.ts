import fs from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function readJson<T>(filename: string, fallback: T): T {
  ensureDir(DATA_DIR);
  const fp = path.join(DATA_DIR, filename);
  if (!fs.existsSync(fp)) return fallback;
  try { return JSON.parse(fs.readFileSync(fp, "utf8")); } catch { return fallback; }
}

export function writeJson(filename: string, data: unknown) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

export function listSubdir(subdir: string): string[] {
  const dir = path.join(DATA_DIR, subdir);
  ensureDir(dir);
  return fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort().reverse();
}

export function readSubdirItem<T>(subdir: string, id: string, fallback: T): T {
  const fp = path.join(DATA_DIR, subdir, `${id}.json`);
  if (!fs.existsSync(fp)) return fallback;
  try { return JSON.parse(fs.readFileSync(fp, "utf8")); } catch { return fallback; }
}

export function writeSubdirItem(subdir: string, id: string, data: unknown) {
  const dir = path.join(DATA_DIR, subdir);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(data, null, 2));
}

export function deleteSubdirItem(subdir: string, id: string): boolean {
  const fp = path.join(DATA_DIR, subdir, `${id}.json`);
  if (!fs.existsSync(fp)) return false;
  fs.unlinkSync(fp);
  return true;
}

export { DATA_DIR };
