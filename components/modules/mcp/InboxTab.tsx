"use client";

import { Archive, Check, Mail, MessageCircle, RefreshCw, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { TabProps } from "@/components/workspace/Tabs";
import { api, Badge, Card, Empty, ExampleBadge, fmtDate } from "@/components/workspace/ui";
import "./mcp.css";

type Msg = {
  id: string; channel: "email" | "whatsapp"; provider: string; from: string; fromName?: string; subject?: string; body: string; receivedAt: string;
  category: string; priority: "haute" | "normale" | "basse"; score: number; reasons: string[]; routine?: string; suggestedReply: string;
  status: "nouveau" | "traite" | "archive"; isExample: boolean; replyStatus?: string;
};
type Inbox = { messages: Msg[]; sources: { id: string; name: string; provider: string; status: string; demo: boolean; enabled: boolean }[]; stats: { nouveaux: number; haute: number } };

const ROUTINES: Record<string, string> = {
  accuse_reception: "Accusé de réception",
  refus_candidature: "Refus de candidature",
  relance_paiement: "Relance de paiement",
  confirmation_partenariat: "Confirmation de partenariat",
};
const PRIO = { haute: "rose", normale: "amber", basse: "neutral" } as const;

export function InboxTab({ snap, notify, refresh, goTo }: TabProps) {
  const companyId = snap.company.id;
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState<"nouveau" | "tous">("nouveau");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setInbox(await api<Inbox>(`/api/mcp/inbox?companyId=${companyId}`)), [companyId]);
  useEffect(() => {
    void load().catch((e) => notify(e instanceof Error ? e.message : "Erreur", "error"));
  }, [load, notify]);

  const list = (inbox?.messages ?? []).filter((m) => filter === "tous" || m.status === "nouveau");
  const msg = inbox?.messages.find((m) => m.id === selected) ?? list[0];
  useEffect(() => setDraft(msg?.suggestedReply ?? ""), [msg?.id, msg?.suggestedReply]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      await load();
      await refresh();
      notify(ok, "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!inbox) return <div className="ws-loading">Chargement de la boîte unifiée…</div>;
  const real = inbox.sources.filter((s) => !s.demo && s.enabled);

  return (
    <div className="ws-stack">
      <div className="ws-info">
        <Mail size={16} /> Emails et WhatsApp classés et priorisés. Sources réelles : {real.length ? real.map((s) => `${s.name} (${s.status})`).join(", ") : "aucune — messages de DÉMO"}.
        Toute réponse attend votre validation dans « Approbations ».
        <button className="ws-btn ws-btn-ghost ws-btn-sm" disabled={busy} onClick={() => void act(() => api("/api/mcp/inbox", "POST", { companyId }), "Synchronisation terminée")}><RefreshCw size={14} /> Synchroniser</button>
        <button className="ws-btn ws-btn-ghost ws-btn-sm" onClick={() => goTo("connecteurs")}>Brancher Gmail / Outlook / WhatsApp</button>
      </div>
      <div className="mcp-row">
        <Badge tone="rose">{inbox.stats.haute} prioritaire(s)</Badge>
        <Badge>{inbox.stats.nouveaux} à traiter</Badge>
        <select value={filter} onChange={(e) => setFilter(e.target.value as "nouveau" | "tous")}><option value="nouveau">À traiter</option><option value="tous">Tous</option></select>
      </div>
      {list.length === 0 ? <Empty>Rien à traiter.</Empty> : (
        <div className="ws-split">
          <div className="ws-list">
            {list.map((m) => (
              <button key={m.id} className={`ws-list-item mcp-msg prio-${m.priority} ${msg?.id === m.id ? "is-active" : ""}`} onClick={() => setSelected(m.id)}>
                <div className="ws-list-top">{m.channel === "whatsapp" ? <MessageCircle size={14} /> : <Mail size={14} />} <strong>{m.subject ?? m.body.slice(0, 50)}</strong></div>
                <div className="ws-list-sub"><Badge tone={PRIO[m.priority]}>{m.priority}</Badge> <span>{m.category}</span> <span>{m.fromName ?? m.from}</span> {m.isExample && <ExampleBadge />}</div>
              </button>
            ))}
          </div>
          {msg && (
            <Card title={msg.subject ?? `WhatsApp de ${msg.fromName ?? msg.from}`} actions={<><Badge tone={PRIO[msg.priority]}>Priorité {msg.priority} · {msg.score}</Badge>{msg.isExample && <ExampleBadge />}</>}>
              <div className="ws-email-preview">
                <div><span>De</span> {msg.fromName ? `${msg.fromName} <${msg.from}>` : msg.from}</div>
                <div><span>Reçu</span> {fmtDate(msg.receivedAt, true)} · {msg.channel === "whatsapp" ? "WhatsApp" : `email (${msg.provider})`}</div>
                <div><span>Classement</span> {msg.category} — {msg.reasons.join(", ") || "aucun signal"}</div>
                <pre>{msg.body}</pre>
              </div>
              <label className="ws-label">Réponse suggérée (modifiable)</label>
              <textarea className="mcp-reply" value={draft} onChange={(e) => setDraft(e.target.value)} />
              <div className="mcp-row">
                <button className="ws-btn ws-btn-primary" disabled={busy || !draft.trim()} onClick={() => void act(() => api(`/api/mcp/inbox/${msg.id}`, "POST", { action: "repondre", corps: draft }), "Réponse placée en approbation")}><Send size={14} /> Préparer l&apos;envoi</button>
                {Object.entries(ROUTINES).map(([k, label]) => (
                  <button key={k} className={`ws-btn ws-btn-sm ${msg.routine === k ? "ws-btn-primary" : "ws-btn-ghost"}`} disabled={busy} onClick={() => void act(() => api(`/api/mcp/inbox/${msg.id}`, "POST", { action: "routine", routine: k }), `${label} placé en approbation`)}>{label}</button>
                ))}
              </div>
              <div className="mcp-row">
                <button className="ws-btn ws-btn-ghost ws-btn-sm" onClick={() => void act(() => api(`/api/mcp/inbox/${msg.id}`, "POST", { action: "statut", status: "traite" }), "Marqué traité")}><Check size={14} /> Traité</button>
                <button className="ws-btn ws-btn-ghost ws-btn-sm" onClick={() => void act(() => api(`/api/mcp/inbox/${msg.id}`, "POST", { action: "statut", status: "archive" }), "Archivé")}><Archive size={14} /> Archiver</button>
                {msg.replyStatus && <Badge tone={msg.replyStatus === "approuvee" ? "green" : "amber"}>Réponse : {msg.replyStatus}</Badge>}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
