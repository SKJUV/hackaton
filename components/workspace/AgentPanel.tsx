"use client";

import { ArrowUp, Bot, CheckCircle2, ExternalLink, Loader2, Trash2, Wrench, XCircle } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { Citation } from "@/lib/legal/citations";
import type { Snapshot } from "@/lib/workspace/service";
import type { ToolTrace } from "@/lib/workspace/types";
import { api, Badge, Markdown } from "./ui";

type Msg = { role: "user" | "assistant"; content: string; toolTrace?: ToolTrace[]; citations?: Citation[]; mode?: string; provider?: string; notice?: string };

const SUGGESTIONS = [
  "Donne-moi mon briefing du jour",
  "Trouve des fournisseurs de motos de livraison et demande des devis pour 10 motos",
  "Quel régime d'autorisation pour un service de livraison de colis ?",
  "Génère le business plan et une roadmap 6 mois",
  "Génère les statuts de la société",
  "Envoie un mail à banque@example.com pour demander un rendez-vous d'ouverture de compte",
  "Quelles sont mes prochaines échéances fiscales ?",
  "Fais une veille réglementaire pour mon secteur",
];

const TOOL_LABELS: Record<string, string> = {
  rechercher_textes_juridiques: "Recherche juridique",
  rediger_email: "Rédaction d'email",
  lister_fournisseurs: "Annuaire fournisseurs",
  demander_devis: "Demande de devis",
  suivre_devis: "Suivi des devis",
  relancer_fournisseur: "Relance fournisseur",
  creer_tache: "Création de tâche",
  lister_taches: "Tâches",
  generer_business_plan: "Business plan",
  generer_roadmap: "Roadmap",
  checklist_creation_entreprise: "Démarches",
  mettre_a_jour_demarche: "Mise à jour démarche",
  generer_document_juridique: "Document juridique",
  score_conformite: "Score de conformité",
  calendrier_obligations: "Calendrier",
  veille_reglementaire: "Veille réglementaire",
  briefing_cofondateur: "Briefing",
};

export function AgentPanel({ snap, onChange, goTo }: { snap: Snapshot; onChange: () => void; goTo: (tab: string) => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(snap.messages.map((m) => ({ role: m.role, content: m.content, toolTrace: m.toolTrace, mode: m.mode })));
    // Recharge uniquement au changement d'entreprise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.company.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || loading) return;
    setInput("");
    setError("");
    setMessages((m) => [...m, { role: "user", content: message }]);
    setLoading(true);
    try {
      const reply = await api<{ answer: string; toolTrace: ToolTrace[]; citations: Citation[]; mode: string; provider?: string; notice?: string }>("/api/agent", "POST", { companyId: snap.company.id, message });
      setMessages((m) => [...m, { role: "assistant", content: reply.answer, toolTrace: reply.toolTrace, citations: reply.citations, mode: reply.mode, provider: reply.provider, notice: reply.notice }]);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function clear() {
    await api(`/api/agent?companyId=${snap.company.id}`, "DELETE");
    setMessages([]);
  }

  const pending = snap.approvals.filter((a) => a.status === "en_attente").length;

  return (
    <div className="ws-agent">
      <div className="ws-agent-scroll">
        {messages.length === 0 && (
          <div className="ws-agent-hello">
            <div className="ws-agent-avatar"><Bot size={26} /></div>
            <h2>Votre co-fondateur IA pour {snap.company.name}</h2>
            <p>Je rédige et envoie vos emails (après validation), contacte les fournisseurs, suis vos démarches, prépare business plan, statuts et contrats, et réponds à vos questions juridiques en citant les textes officiels.</p>
            <div className="ws-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => void send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ws-msg ws-msg-${m.role}`}>
            {m.role === "assistant" && (
              <div className="ws-msg-meta">
                <Bot size={14} /> Co-fondateur IA
                {m.mode === "demo" && <Badge tone="amber" title="Aucune clé IA : planificateur à règles, mêmes outils">Mode démo</Badge>}
                {m.provider && <Badge tone="accent">{m.provider}</Badge>}
              </div>
            )}
            {m.notice && <p className="ws-notice">{m.notice}</p>}
            {m.toolTrace && m.toolTrace.length > 0 && (
              <div className="ws-trace">
                {m.toolTrace.map((t, j) => (
                  <span key={j} className={`ws-trace-item ${t.ok ? "" : "is-error"}`} title={JSON.stringify(t.input)}>
                    {t.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                    <Wrench size={12} /> <strong>{TOOL_LABELS[t.tool] ?? t.tool}</strong> — {t.summary}
                  </span>
                ))}
              </div>
            )}
            <Markdown text={m.content} />
            {m.citations && m.citations.length > 0 && (
              <div className="ws-citations">
                {m.citations.map((c) => (
                  <div key={c.id} className={`ws-citation ${c.isExample ? "is-example" : ""}`}>
                    <span className="ws-cite">{c.id}</span>
                    <div>
                      <strong>{c.legalTitle ?? c.title}</strong>
                      <small>
                        {c.isExample ? "⚠️ Texte d'exemple, non officiel" : c.category} · page {c.page}
                        {c.articles.length > 0 && ` · art. ${c.articles.join(", ")}`}
                      </small>
                    </div>
                    {!c.isExample && c.file.toLowerCase().endsWith(".pdf") && (
                      <a href={`/api/document?file=${encodeURIComponent(c.file)}#page=${c.page}`} target="_blank" rel="noreferrer" title="Ouvrir le PDF officiel">
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="ws-msg ws-msg-assistant">
            <div className="ws-msg-meta"><Loader2 size={14} className="ws-spin" /> Le co-fondateur agit…</div>
          </div>
        )}
        {error && <p className="ws-error">{error}</p>}
        <div ref={endRef} />
      </div>
      {pending > 0 && (
        <button type="button" className="ws-pending-banner" onClick={() => goTo("approbations")}>
          {pending} action(s) externe(s) attendent votre validation → Approbations
        </button>
      )}
      <form
        className="ws-composer"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <button type="button" className="ws-icon-btn" onClick={() => void clear()} title="Effacer la conversation"><Trash2 size={16} /></button>
        <textarea
          value={input}
          rows={1}
          placeholder="Demandez une action : « contacte 3 fournisseurs de cartons », « rédige un NDA avec Akwa Digital »…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <button type="submit" className="ws-send" disabled={loading || !input.trim()} aria-label="Envoyer"><ArrowUp size={18} /></button>
      </form>
    </div>
  );
}
