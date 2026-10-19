import { newId, nowIso, readData, withData } from "@/lib/workspace/store";
import { WorkspaceError } from "@/lib/workspace/service";
import type { WorkspaceData } from "@/lib/workspace/types";
import { openBag, sealBag } from "./crypto";
import type { CallStatus, Connection, ConnectorCall, McpData, SecretBag } from "./types";

/** Données du module dans le store JSON existant (champ optionnel `mcp`, migration implicite). */
export function mcpOf(data: WorkspaceData): McpData {
  data.mcp ??= { connections: [], calls: [], oauthPending: [], inbox: [], serverTokens: [] };
  const m = data.mcp;
  m.connections ??= [];
  m.calls ??= [];
  m.oauthPending ??= [];
  m.inbox ??= [];
  m.serverTokens ??= [];
  return m;
}

export async function readMcp(): Promise<{ data: WorkspaceData; mcp: McpData }> {
  const data = await readData();
  return { data, mcp: mcpOf(data) };
}

export async function getConnection(id: string): Promise<Connection> {
  const { mcp } = await readMcp();
  const conn = mcp.connections.find((c) => c.id === id);
  if (!conn) throw new WorkspaceError("Connecteur introuvable.", 404);
  return conn;
}

export function updateConnection(id: string, fn: (c: Connection, data: WorkspaceData) => void) {
  return withData((data) => {
    const conn = mcpOf(data).connections.find((c) => c.id === id);
    if (!conn) throw new WorkspaceError("Connecteur introuvable.", 404);
    fn(conn, data);
    conn.updatedAt = nowIso();
    return structuredClone(conn);
  });
}

export async function saveBag(id: string, bag: SecretBag) {
  return updateConnection(id, (c) => {
    c.secret = sealBag(bag);
  });
}

export const bagOf = (c: Connection) => openBag(c.secret);

/** Vue publique : AUCUN secret, seulement des indicateurs. */
export function publicConnection(c: Connection) {
  const bag = openBag(c.secret);
  const { secret: _secret, ...rest } = c;
  void _secret;
  return {
    ...rest,
    hasBearer: Boolean(bag.bearer),
    hasOAuthTokens: Boolean(bag.tokens?.access_token),
    hasClientRegistration: Boolean(bag.clientInformation),
  };
}
export type PublicConnection = ReturnType<typeof publicConnection>;

const SECRET_KEYS = /token|secret|password|mot_de_passe|authorization|api[_-]?key|bearer/i;

/** Masque les arguments sensibles avant journalisation. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "…";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEYS.test(k) ? "•••" : redact(v, depth + 1)]));
  }
  if (typeof value === "string" && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

export function pushCall(data: WorkspaceData, input: Omit<ConnectorCall, "id" | "createdAt" | "args"> & { args: Record<string, unknown> }): ConnectorCall {
  const call: ConnectorCall = { ...input, args: redact(input.args) as Record<string, unknown>, id: newId("mcc"), createdAt: nowIso() };
  const m = mcpOf(data);
  m.calls.unshift(call);
  if (m.calls.length > 3000) m.calls.length = 3000;
  return call;
}

export function setCallStatus(data: WorkspaceData, approvalId: string, status: CallStatus, patch: Partial<ConnectorCall> = {}) {
  const call = mcpOf(data).calls.find((c) => c.approvalId === approvalId);
  if (call) Object.assign(call, { status, ...patch });
}

export { newId, nowIso, readData, withData };
