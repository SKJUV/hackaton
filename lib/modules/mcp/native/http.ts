/** Appels HTTP vers les API officielles. Les messages d'erreur ne contiennent jamais de jeton. */
export class ConnectorHttpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

type Opts = {
  method?: string;
  token?: string;
  json?: unknown;
  form?: Record<string, string>;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export async function apiFetch<T = unknown>(provider: string, url: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: string | undefined;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(opts.form).toString();
  }
  const res = await fetch(url, { method: opts.method ?? (body ? "POST" : "GET"), headers, body, signal: AbortSignal.timeout(opts.timeoutMs ?? 20000) });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* réponse non JSON */
  }
  if (!res.ok) throw new ConnectorHttpError(`${provider} HTTP ${res.status} : ${providerMessage(data) ?? res.statusText}`, res.status);
  return data as T;
}

function providerMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return typeof data === "string" ? data.slice(0, 200) : undefined;
  const d = data as Record<string, unknown>;
  const err = d.error as Record<string, unknown> | string | undefined;
  if (typeof err === "string") return [err, d.error_description].filter(Boolean).join(" — ");
  if (err && typeof err === "object") return String(err.message ?? err.code ?? JSON.stringify(err)).slice(0, 300);
  if (typeof d.message === "string") return d.message;
  return undefined;
}
