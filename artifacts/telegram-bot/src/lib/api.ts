// Helper for raw fetch calls that respects the active API server selected in
// Settings (localStorage `mfg_api_base`). The generated api-client hooks already
// respect setBaseUrl, but raw fetches need this prefix applied manually.
export function apiBase(): string {
  const base = localStorage.getItem("mfg_api_base") || "";
  return base.replace(/\/+$/, "");
}

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = apiBase();
  // When no custom server is set, use the app's own origin under /api
  return base ? `${base}${p}` : `/api${p.replace(/^\/api/, "")}`;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init);
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const r = await apiFetch(path);
  return r.json();
}

export async function apiPost<T = any>(path: string, body?: unknown): Promise<T> {
  const r = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

export async function apiDelete<T = any>(path: string): Promise<T> {
  const r = await apiFetch(path, { method: "DELETE" });
  return r.json();
}
