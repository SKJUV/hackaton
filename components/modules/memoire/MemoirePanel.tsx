"use client";

import { BookOpen, Brain, Plus, Search } from "lucide-react";
import { useState } from "react";
import type { TabProps } from "@/components/workspace/Tabs";
import { api, Badge, Card, Empty, ExampleBadge, fmtDate, Markdown } from "@/components/workspace/ui";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { AudioSpeakerButton } from "@/components/voice/AudioSpeakerButton";
import type { MemoryAnswer } from "@/lib/modules/memoire/memory";
import type { Decision, DecisionStatus } from "@/lib/modules/memoire/types";
import { LegalSnapshotView } from "./LegalSnapshotView";
import { tabFor, useMemoire } from "./useMemoire";
import "./memoire.css";

const STATUS: Record<DecisionStatus, { label: string; tone: "accent" | "green" | "amber" | "neutral" }> = {
  proposee: { label: "Proposée", tone: "accent" },
  adoptee: { label: "Adoptée", tone: "green" },
  revisee: { label: "Révisée", tone: "amber" },
  abandonnee: { label: "Abandonnée", tone: "neutral" },
};

const EXAMPLES = ["Pourquoi avons-nous choisi cette structure juridique ?", "Qu'avons-nous décidé pour l'encaissement ?", "Qui doit rédiger les statuts ?"];

/** Onglet « Mémoire & décisions » : questions-réponses sourcées + registre des décisions. */
export default function MemoirePanel({ snap, memberId, notify, goTo }: TabProps) {
  const { data, error, reload } = useMemoire(snap.company.id);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<MemoryAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function ask(q = question) {
    if (q.trim().length < 3) return;
    setBusy(true);
    try {
      setAnswer(await api<MemoryAnswer>("/api/memoire/ask", "POST", { companyId: snap.company.id, question: q }));
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "error");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(d: Decision, status: DecisionStatus) {
    const note = status === "revisee" || status === "abandonnee" ? window.prompt("Motif (consigné au registre) :") ?? "" : "";
    try {
      await api(`/api/memoire/decisions/${d.id}`, "PATCH", { status, note, memberId });
      await reload();
      notify("Registre mis à jour");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "error");
    }
  }

  if (error) return <Card title="Mémoire organisationnelle"><p>{error}</p></Card>;
  const decisions = (data?.decisions ?? []).filter((d) => !filter || `${d.title} ${d.decision} ${d.rationale} ${d.tags.join(" ")}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="mem">
      <Card title={<><Brain size={16} /> Interroger la mémoire de l&apos;entreprise</>} actions={data && <Badge tone={data.ai.demo ? "violet" : "green"}>{data.ai.demo ? "Réponse extractive (démo)" : `IA : ${data.ai.providers[0]}`}</Badge>}>
        <p className="ws-muted">Décisions, documents, emails, réunions, journal d&apos;audit et conversations sont indexés. Chaque réponse renvoie vers ses éléments sources et vers les articles de loi consultés au moment de la décision.</p>
        <form className="mem-ask" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ex. Pourquoi avons-nous choisi cette structure juridique ?" />
          <VoiceInputButton onTranscript={setQuestion} disabled={busy} />
          <button className="ws-btn ws-btn-primary" disabled={busy}><Search size={14} /> {busy ? "Recherche…" : "Demander"}</button>
        </form>
        <div className="mem-chips">{EXAMPLES.map((q) => <button key={q} className="mem-chip" onClick={() => { setQuestion(q); void ask(q); }}>{q}</button>)}</div>
        {answer && (
          <div className="mem-answer">
            <div className="mem-answer-head"><Badge tone={answer.mode === "llm" ? "green" : "violet"}>{answer.mode === "llm" ? `IA · ${answer.provider}` : "Mode démo · extractif"}</Badge><AudioSpeakerButton text={answer.answer} /></div>
            <Markdown text={answer.answer} />
            {answer.decisions[0] && <LegalSnapshotView legal={answer.decisions[0].legal} />}
            {answer.hits.length > 0 && (
              <>
                <h4>Éléments sources</h4>
                <ul className="mem-hits">
                  {answer.hits.map((h) => (
                    <li key={h.id}>
                      <b>[{h.id}]</b> <button className="ws-link" onClick={() => goTo(tabFor(h.ref))}>{h.ref.label}</button> · {fmtDate(h.date)} {h.isExample && <ExampleBadge />}
                      <div className="ws-muted">« {h.excerpt} »</div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </Card>

      <Card title={<><BookOpen size={16} /> Registre des décisions</>} actions={<><input className="mem-filter" placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} /><button className="ws-btn" onClick={() => setShowForm((v) => !v)}><Plus size={14} /> Nouvelle décision</button></>}>
        {showForm && <DecisionForm companyId={snap.company.id} memberId={memberId} onDone={async () => { setShowForm(false); await reload(); notify("Décision enregistrée avec son fondement juridique"); }} onError={(m) => notify(m, "error")} />}
        {!data ? <p>Chargement…</p> : !decisions.length ? <Empty>Aucune décision enregistrée. Les décisions de réunion y sont ajoutées automatiquement.</Empty> : (
          <div className="mem-decisions">
            {decisions.map((d) => (
              <article key={d.id} className="mem-decision" id={d.id}>
                <header>
                  <h4>{d.title}</h4>
                  <div className="mem-row">
                    <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
                    {d.isExample && <ExampleBadge />}
                    <span className="ws-muted">{fmtDate(d.decidedAt)} · {d.decidedBy}</span>
                    <select value={d.status} onChange={(e) => void setStatus(d, e.target.value as DecisionStatus)} aria-label="Changer le statut">
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                </header>
                {d.decision !== d.title && <p>{d.decision}</p>}
                <p><strong>Pourquoi :</strong> {d.rationale || <em>motivation non consignée</em>}</p>
                {d.alternatives.length > 0 && <p><strong>Alternatives écartées :</strong> {d.alternatives.join(" ; ")}</p>}
                {d.sources.length > 0 && <p className="ws-muted">Sources : {d.sources.map((s) => <button key={s.id} className="ws-link" onClick={() => goTo(tabFor(s))}>{s.label}</button>)}</p>}
                {d.taskIds.length > 0 && <p className="ws-muted">{d.taskIds.length} tâche(s) de suivi · <button className="ws-link" onClick={() => goTo("taches")}>voir</button></p>}
                <LegalSnapshotView legal={d.legal} />
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function DecisionForm({ companyId, memberId, onDone, onError }: { companyId: string; memberId: string; onDone: () => Promise<void>; onError: (m: string) => void }) {
  const [f, setF] = useState({ title: "", decision: "", rationale: "", alternatives: "", status: "adoptee" });
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await api("/api/memoire/decisions", "POST", { companyId, memberId, ...f, alternatives: f.alternatives.split("\n") });
      await onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="mem-form">
      <input placeholder="Titre * (ex. Structure juridique : SAS)" value={f.title} onChange={set("title")} />
      <textarea placeholder="Décision *" rows={2} value={f.decision} onChange={set("decision")} />
      <textarea placeholder="Pourquoi ? (raisons)" rows={2} value={f.rationale} onChange={set("rationale")} />
      <textarea placeholder="Alternatives écartées (une par ligne)" rows={2} value={f.alternatives} onChange={set("alternatives")} />
      <div className="mem-row">
        <select value={f.status} onChange={set("status")}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <button className="ws-btn ws-btn-primary" disabled={busy || !f.title.trim()} onClick={() => void submit()}>{busy ? "Recherche juridique…" : "Enregistrer (avec fondement juridique)"}</button>
      </div>
    </div>
  );
}
