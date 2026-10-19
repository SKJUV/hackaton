"use client";

import { Cable, KeyRound, Link2, Plug, PlugZap, RefreshCw, ShieldCheck, Trash2, Wrench } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { TabProps } from "@/components/workspace/Tabs";
import { api, Badge, Card, Empty, fmtDate } from "@/components/workspace/ui";
import "./mcp.css";

type Tool = { name: string; description: string; write: boolean; sends?: boolean };
type Conn = {
  id: string; name: string; kind: "mcp" | "native"; catalogId?: string; provider?: string; url?: string; transport: string; authMode: string;
  enabled: boolean; status: string; demo: boolean; account?: string; tools: Tool[]; toolOverrides: Record<string, { enabled?: boolean; write?: boolean }>;
  lastError?: string; lastTestedAt?: string; hasBearer: boolean; hasOAuthTokens: boolean; config: Record<string, string>;
};
type Entry = {
  id: string; name: string; kind: "mcp" | "native"; category: string; description: string; url?: string; auth: string[]; oauthReady: boolean; envToken: boolean;
  missingEnv: string[]; bearerHint?: string; docsUrl: string; notes?: string; provider?: string; oauth?: { dcr: boolean };
};
type Settings = { encryption: { status: string; message: string }; sendMode: string; redirectUri: string; stdio: boolean; mcpServerUrl: string };
type Call = { id: string; connectionName: string; tool: string; status: string; write: boolean; durationMs?: number; error?: string; resultPreview?: string; actor: string; createdAt: string };
type Token = { id: string; name: string; prefix: string; scopes: string[]; createdAt: string; lastUsedAt?: string; revokedAt?: string; token?: string };

const STATUS: Record<string, { label: string; tone: "green" | "amber" | "rose" | "violet" | "neutral" }> = {
  connecte: { label: "Réel · connecté", tone: "green" },
  demo: { label: "DÉMO (données fictives)", tone: "amber" },
  autorisation_requise: { label: "Autorisation requise", tone: "violet" },
  erreur: { label: "Erreur", tone: "rose" },
  non_connecte: { label: "À tester", tone: "neutral" },
};
const CALL: Record<string, "green" | "amber" | "rose" | "violet" | "neutral"> = { succes: "green", simule: "violet", demo: "amber", erreur: "rose", en_attente_approbation: "amber", rejete: "neutral" };

export function ConnectorsTab({ snap, memberId, notify, refresh }: TabProps) {
  const companyId = snap.company.id;
  const [data, setData] = useState<{ catalog: Entry[]; connections: Conn[]; settings: Settings } | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [bearer, setBearer] = useState<Record<string, string>>({});
  const [phone, setPhone] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [custom, setCustom] = useState({ name: "", url: "", transport: "auto", authMode: "none", bearer: "", command: "", args: "" });
  const [tryCall, setTryCall] = useState<{ conn: string; tool: string; args: string; result?: string } | null>(null);
  const [newToken, setNewToken] = useState({ name: "Claude / Cursor", ecriture: true, approbation: false });
  const [created, setCreated] = useState<Token | null>(null);

  const load = useCallback(async () => {
    const [d, l] = await Promise.all([
      api<{ catalog: Entry[]; connections: Conn[]; settings: Settings }>(`/api/mcp/connectors?companyId=${companyId}`),
      api<{ calls: Call[] }>(`/api/mcp/logs?companyId=${companyId}`),
    ]);
    setData(d);
    setCalls(l.calls);
    api<{ tokens: Token[] }>(`/api/mcp/tokens?companyId=${companyId}`).then((t) => setTokens(t.tokens)).catch(() => setTokens([]));
  }, [companyId]);

  useEffect(() => {
    void load().catch((e) => notify(e instanceof Error ? e.message : "Erreur", "error"));
    const q = new URLSearchParams(window.location.search);
    const o = q.get("oauth");
    if (o) {
      notify(o === "ok" ? "Compte connecté (OAuth) et testé" : o === "test_echoue" ? "Autorisé, mais le test a échoué" : `OAuth : ${q.get("message") ?? "erreur"}`, o === "ok" ? "success" : "error");
      window.history.replaceState(null, "", "/workspace");
    }
  }, [load, notify]);

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    try {
      const r = await fn();
      await load();
      await refresh();
      if (ok) notify(ok, "success");
      return r;
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "error");
    } finally {
      setBusy(null);
    }
  }

  async function authorize(id: string) {
    const r = (await run(`oauth-${id}`, () => api<{ authorizationUrl?: string; alreadyAuthorized?: boolean }>(`/api/mcp/connectors/${id}/oauth`, "POST"))) as { authorizationUrl?: string } | undefined;
    if (r?.authorizationUrl) window.location.href = r.authorizationUrl;
  }

  async function add(entry: Entry, mode: "oauth" | "bearer" | "demo" | "env") {
    const created = (await run(`add-${entry.id}-${mode}`, () =>
      api<Conn>("/api/mcp/connectors", "POST", { companyId, catalogId: entry.id, demo: mode === "demo", useEnvToken: mode === "env", bearer: mode === "bearer" ? bearer[entry.id] : undefined, config: phone[entry.id] ? { phoneNumberId: phone[entry.id] } : undefined }),
    )) as Conn | undefined;
    if (!created) return;
    setBearer({ ...bearer, [entry.id]: "" });
    if (mode === "oauth" && !created.demo) await authorize(created.id);
    else await run(`test-${created.id}`, () => api(`/api/mcp/connectors/${created.id}/test`, "POST"), mode === "demo" ? "Connecteur ajouté en mode DÉMO" : "Connecteur ajouté et testé");
  }

  if (!data) return <div className="ws-loading">Chargement des connecteurs…</div>;
  const { settings } = data;
  const categories = [...new Set(data.catalog.map((c) => c.category))];

  return (
    <div className="ws-stack">
      <div className="ws-info">
        <ShieldCheck size={16} /> Vraies connexions via MCP et API officielles. Lectures directes, écritures et envois <strong>toujours soumis à approbation</strong>. Envois à des tiers :{" "}
        <strong>{settings.sendMode === "live" ? "RÉELS (après validation)" : "simulation (CONNECTORS_SEND_MODE)"}</strong>. {settings.encryption.message}
      </div>

      <Card title={<><Plug size={16} /> Connecteurs de {snap.company.name}</>} actions={<button className="ws-btn ws-btn-ghost ws-btn-sm" onClick={() => void load()}><RefreshCw size={14} /> Actualiser</button>}>
        {data.connections.length === 0 && <Empty>Aucun connecteur. Choisissez-en un dans le catalogue ci-dessous.</Empty>}
        <div className="ws-stack">
          {data.connections.map((c) => {
            const st = STATUS[c.status] ?? STATUS.non_connecte;
            return (
              <div key={c.id} className="mcp-entry">
                <div className="mcp-row">
                  <h4>{c.name}</h4>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <Badge>{c.kind === "mcp" ? `MCP · ${c.transport}` : "API native"}</Badge>
                  <Badge>{c.authMode === "oauth" ? "OAuth" : c.authMode === "bearer" ? "Jeton" : "Sans auth"}</Badge>
                  {c.account && <span className="ws-muted">{c.account}</span>}
                </div>
                {c.url && <small className="ws-muted">{c.url}</small>}
                {c.lastError && <small className="ws-error">{c.lastError}</small>}
                <div className="mcp-row">
                  <label className="mcp-row"><input type="checkbox" checked={c.enabled} onChange={(e) => void run(`en-${c.id}`, () => api(`/api/mcp/connectors/${c.id}`, "PATCH", { enabled: e.target.checked }), e.target.checked ? "Activé pour l'entreprise" : "Désactivé")} /> Actif pour l&apos;entreprise</label>
                  <button className="ws-btn ws-btn-ghost ws-btn-sm" disabled={busy === `test-${c.id}`} onClick={() => void run(`test-${c.id}`, () => api(`/api/mcp/connectors/${c.id}/test`, "POST"), "Test terminé")}><PlugZap size={14} /> Tester</button>
                  {c.authMode === "oauth" && !c.demo && <button className="ws-btn ws-btn-primary ws-btn-sm" onClick={() => void authorize(c.id)}><KeyRound size={14} /> {c.hasOAuthTokens ? "Ré-autoriser" : "Autoriser (OAuth)"}</button>}
                  <button className="ws-btn ws-btn-ghost ws-btn-sm" onClick={() => setOpen(open === c.id ? null : c.id)}><Wrench size={14} /> Outils ({c.tools.length})</button>
                  <button className="ws-btn ws-btn-ghost ws-btn-sm" onClick={() => window.confirm(`Supprimer « ${c.name} » et ses secrets ?`) && void run(`del-${c.id}`, () => api(`/api/mcp/connectors/${c.id}`, "DELETE"), "Connecteur supprimé")}><Trash2 size={14} /></button>
                </div>
                {c.provider === "whatsapp" && !c.demo && (
                  <div className="mcp-row">
                    <input placeholder={`phone_number_id ${c.config.phoneNumberId ? `(actuel : ${c.config.phoneNumberId})` : ""}`} value={phone[c.id] ?? ""} onChange={(e) => setPhone({ ...phone, [c.id]: e.target.value })} />
                    <button className="ws-btn ws-btn-ghost ws-btn-sm" onClick={() => void run(`ph-${c.id}`, () => api(`/api/mcp/connectors/${c.id}`, "PATCH", { phoneNumberId: phone[c.id] }), "Numéro enregistré")}>Enregistrer</button>
                  </div>
                )}
                {open === c.id && (
                  <table className="mcp-tools">
                    <tbody>
                      {c.tools.map((t) => {
                        const o = c.toolOverrides[t.name] ?? {};
                        const write = t.sends || (o.write ?? t.write);
                        return (
                          <tr key={t.name}>
                            <td><input type="checkbox" title="Outil activé" checked={o.enabled !== false} onChange={(e) => void run(`to-${c.id}`, () => api(`/api/mcp/connectors/${c.id}`, "PATCH", { toolOverrides: { [t.name]: { enabled: e.target.checked } } }))} /></td>
                            <td><code>{t.name}</code><br /><small className="ws-muted">{t.description.slice(0, 160)}</small></td>
                            <td>{write ? <Badge tone="amber">{t.sends ? "Envoi · approbation" : "Écriture · approbation"}</Badge> : <Badge tone="green">Lecture</Badge>}</td>
                            <td><button className="ws-btn ws-btn-ghost ws-btn-sm" onClick={() => setTryCall({ conn: c.id, tool: t.name, args: "{}" })}>Essayer</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {tryCall?.conn === c.id && (
                  <div className="ws-stack">
                    <small>Arguments JSON pour <code>{tryCall.tool}</code> (une écriture crée une demande d&apos;approbation) :</small>
                    <textarea className="mcp-code" rows={3} value={tryCall.args} onChange={(e) => setTryCall({ ...tryCall, args: e.target.value })} />
                    <div className="mcp-row">
                      <button className="ws-btn ws-btn-primary ws-btn-sm" onClick={async () => {
                        let args: unknown;
                        try { args = JSON.parse(tryCall.args || "{}"); } catch { notify("JSON invalide", "error"); return; }
                        const r = await run(`call-${c.id}`, () => api(`/api/mcp/connectors/${c.id}/call`, "POST", { tool: tryCall.tool, args }));
                        if (r) setTryCall({ ...tryCall, result: JSON.stringify(r, null, 2).slice(0, 4000) });
                      }}>Exécuter</button>
                      <button className="ws-btn ws-btn-ghost ws-btn-sm" onClick={() => setTryCall(null)}>Fermer</button>
                    </div>
                    {tryCall.result && <pre className="mcp-code">{tryCall.result}</pre>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title={<><Cable size={16} /> Catalogue</>}>
        <p className="ws-muted">URI de redirection OAuth à déclarer chez chaque fournisseur : <code>{settings.redirectUri}</code></p>
        {categories.map((cat) => (
          <div key={cat} className="ws-stack">
            <h4>{cat}</h4>
            <div className="mcp-catalog">
              {data.catalog.filter((e) => e.category === cat).map((e) => (
                <div key={e.id} className="mcp-entry">
                  <h4>{e.name}</h4>
                  <div className="mcp-badges">
                    <Badge tone={e.kind === "mcp" ? "violet" : "accent"}>{e.kind === "mcp" ? "Serveur MCP officiel" : "API officielle"}</Badge>
                    {e.auth.includes("oauth") && (e.oauthReady ? <Badge tone="green">{e.oauth?.dcr ? "OAuth 2.1 (DCR)" : "OAuth prêt"}</Badge> : <Badge tone="amber" title={e.missingEnv.join(", ")}>OAuth : variables manquantes</Badge>)}
                  </div>
                  <p>{e.description}</p>
                  {e.notes && <small className="ws-muted">{e.notes}</small>}
                  {!e.oauthReady && e.missingEnv.length > 0 && <small className="ws-muted">À définir : {e.missingEnv.join(", ")}</small>}
                  <div className="mcp-row">
                    {e.auth.includes("oauth") && <button className="ws-btn ws-btn-primary ws-btn-sm" disabled={!e.oauthReady || busy !== null} onClick={() => void add(e, "oauth")}><KeyRound size={14} /> Connecter</button>}
                    {e.kind === "native" && <button className="ws-btn ws-btn-ghost ws-btn-sm" disabled={busy !== null} onClick={() => void add(e, "demo")}>Mode démo</button>}
                    {e.envToken && <button className="ws-btn ws-btn-ghost ws-btn-sm" onClick={() => void add(e, "env")}>Jeton serveur (env)</button>}
                    <a className="ws-link" href={e.docsUrl} target="_blank" rel="noreferrer"><Link2 size={13} /> Doc</a>
                  </div>
                  {e.auth.includes("bearer") && (
                    <div className="mcp-row">
                      <input type="password" autoComplete="off" placeholder={e.bearerHint ?? "Jeton"} value={bearer[e.id] ?? ""} onChange={(ev) => setBearer({ ...bearer, [e.id]: ev.target.value })} />
                      {e.provider === "whatsapp" && <input placeholder="phone_number_id" value={phone[e.id] ?? ""} onChange={(ev) => setPhone({ ...phone, [e.id]: ev.target.value })} />}
                      <button className="ws-btn ws-btn-ghost ws-btn-sm" disabled={!bearer[e.id]} onClick={() => void add(e, "bearer")}>Ajouter</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </Card>

      <Card title="Ajouter un serveur MCP (URL + jeton ou OAuth)">
        <div className="mcp-form">
          <input placeholder="Nom" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
          <select value={custom.transport} onChange={(e) => setCustom({ ...custom, transport: e.target.value })}>
            <option value="auto">Auto (Streamable HTTP puis SSE)</option>
            <option value="streamable_http">Streamable HTTP</option>
            <option value="sse">SSE (ancien)</option>
            {settings.stdio && <option value="stdio">stdio (dev local)</option>}
          </select>
          {custom.transport === "stdio" ? (
            <>
              <input placeholder="Commande (ex. npx)" value={custom.command} onChange={(e) => setCustom({ ...custom, command: e.target.value })} />
              <input placeholder="Arguments séparés par des espaces" value={custom.args} onChange={(e) => setCustom({ ...custom, args: e.target.value })} />
            </>
          ) : (
            <input placeholder="https://… /mcp" value={custom.url} onChange={(e) => setCustom({ ...custom, url: e.target.value })} />
          )}
          <select value={custom.authMode} onChange={(e) => setCustom({ ...custom, authMode: e.target.value })}>
            <option value="none">Sans authentification</option>
            <option value="bearer">Jeton (Bearer)</option>
            <option value="oauth">OAuth 2.1 (découverte + PKCE + DCR)</option>
          </select>
          {custom.authMode === "bearer" && <input type="password" autoComplete="off" placeholder="Jeton" value={custom.bearer} onChange={(e) => setCustom({ ...custom, bearer: e.target.value })} />}
          <button className="ws-btn ws-btn-primary" disabled={busy !== null} onClick={async () => {
            const c = (await run("custom", () => api<Conn>("/api/mcp/connectors", "POST", { companyId, name: custom.name, url: custom.url, transport: custom.transport, authMode: custom.authMode, bearer: custom.authMode === "bearer" ? custom.bearer : undefined, stdio: custom.transport === "stdio" ? { command: custom.command, args: custom.args.split(/\s+/).filter(Boolean) } : undefined }))) as Conn | undefined;
            if (!c) return;
            setCustom({ name: "", url: "", transport: "auto", authMode: "none", bearer: "", command: "", args: "" });
            if (c.authMode === "oauth") await authorize(c.id);
            else await run(`test-${c.id}`, () => api(`/api/mcp/connectors/${c.id}/test`, "POST"), "Serveur MCP ajouté et testé");
          }}>Ajouter et tester</button>
        </div>
      </Card>

      <Card title="Serveur MCP de Co-founder (pour Claude, Cursor…)">
        <p className="ws-muted">URL : <code>{settings.mcpServerUrl}</code> — transport Streamable HTTP, en-tête <code>Authorization: Bearer &lt;jeton&gt;</code>. Le jeton est propre à cette entreprise.</p>
        <div className="mcp-row">
          <input placeholder="Nom du client" value={newToken.name} onChange={(e) => setNewToken({ ...newToken, name: e.target.value })} />
          <label className="mcp-row"><input type="checkbox" checked={newToken.ecriture} onChange={(e) => setNewToken({ ...newToken, ecriture: e.target.checked })} /> écriture (tâches, brouillons → approbation)</label>
          <label className="mcp-row"><input type="checkbox" checked={newToken.approbation} onChange={(e) => setNewToken({ ...newToken, approbation: e.target.checked })} /> décider des approbations (en mon nom)</label>
          <button className="ws-btn ws-btn-primary ws-btn-sm" onClick={async () => {
            const t = (await run("token", () => api<Token>("/api/mcp/tokens", "POST", { companyId, name: newToken.name, memberId, scopes: ["lecture", ...(newToken.ecriture ? ["ecriture"] : []), ...(newToken.approbation ? ["approbation"] : [])] }), "Jeton créé")) as Token | undefined;
            if (t) setCreated(t);
          }}>Créer un jeton</button>
        </div>
        {created?.token && (
          <div className="ws-stack">
            <strong>Copiez ce jeton maintenant : il ne sera plus affiché.</strong>
            <pre className="mcp-code">{JSON.stringify({ mcpServers: { "co-founder": { url: settings.mcpServerUrl, headers: { Authorization: `Bearer ${created.token}` } } } }, null, 2)}</pre>
            <button className="ws-btn ws-btn-ghost ws-btn-sm" onClick={() => setCreated(null)}>J&apos;ai copié le jeton</button>
          </div>
        )}
        {tokens.length > 0 && (
          <table className="ws-table">
            <thead><tr><th>Nom</th><th>Préfixe</th><th>Portées</th><th>Dernier usage</th><th></th></tr></thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td><td><code>{t.prefix}…</code></td><td>{t.scopes.join(", ")}</td><td>{t.revokedAt ? "révoqué" : fmtDate(t.lastUsedAt, true)}</td>
                  <td>{!t.revokedAt && <button className="ws-btn ws-btn-ghost ws-btn-sm" onClick={() => void run(`rv-${t.id}`, () => api(`/api/mcp/tokens?id=${t.id}`, "DELETE"), "Jeton révoqué")}>Révoquer</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Journal des appels de connecteurs">
        {calls.length === 0 ? <Empty>Aucun appel pour l&apos;instant.</Empty> : (
          <table className="ws-table">
            <thead><tr><th>Date</th><th>Connecteur</th><th>Outil</th><th>Statut</th><th>Par</th><th>Détail</th></tr></thead>
            <tbody>
              {calls.slice(0, 100).map((c) => (
                <tr key={c.id}>
                  <td className="ws-nowrap">{fmtDate(c.createdAt, true)}</td><td>{c.connectionName}</td><td><code>{c.tool}</code>{c.write && " ✎"}</td>
                  <td><Badge tone={CALL[c.status] ?? "neutral"}>{c.status.replace(/_/g, " ")}</Badge></td><td>{c.actor}</td>
                  <td><small className={c.error ? "ws-error" : "ws-muted"}>{(c.error ?? c.resultPreview ?? "").slice(0, 140)}{c.durationMs !== undefined && ` · ${c.durationMs} ms`}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
