"use client";

import { Check, ExternalLink, FilePlus2, Mail, RefreshCw, Search, Send, ShieldAlert, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Citation } from "@/lib/legal/citations";
import type { LegalSearch } from "@/lib/legal/corpus";
import type { Snapshot } from "@/lib/workspace/service";
import type { WatchAlert } from "@/lib/compliance";
import { api, Badge, Card, Empty, ExampleBadge, fmtDate, fmtMoney, Markdown, StatusBadge } from "./ui";

export type TabProps = {
  snap: Snapshot;
  memberId: string;
  refresh: () => Promise<void>;
  notify: (text: string, type?: "success" | "error" | "info") => void;
  goTo: (tab: string) => void;
};

function useAction(refresh: () => Promise<void>, notify: TabProps["notify"]) {
  const [busy, setBusy] = useState<string | null>(null);
  return {
    busy,
    async run(key: string, fn: () => Promise<unknown>, success?: string) {
      setBusy(key);
      try {
        await fn();
        await refresh();
        if (success) notify(success, "success");
      } catch (e) {
        notify(e instanceof Error ? e.message : "Erreur", "error");
      } finally {
        setBusy(null);
      }
    },
  };
}

/* ------------------------------------------------------------ Tableau de bord */

export function Dashboard({ snap, goTo }: TabProps) {
  const pending = snap.approvals.filter((a) => a.status === "en_attente");
  const openTasks = snap.tasks.filter((t) => t.status !== "fait");
  const nextObligations = snap.obligations.filter((o) => !o.done).slice(0, 4);
  const doneSteps = snap.checklist.filter((s) => s.status === "fait").length;
  const c = snap.compliance;
  return (
    <div className="ws-grid">
      <Card title="Score de conformité" className="ws-span-2">
        <div className="ws-score">
          <div className={`ws-score-ring level-${c.level}`} style={{ ["--p" as string]: c.score }}>
            <span>{c.score}</span>
            <small>/100</small>
          </div>
          <div className="ws-score-detail">
            {c.breakdown.map((b) => (
              <div key={b.label} className="ws-bar">
                <div className="ws-bar-label"><span>{b.label}</span><span>{b.points}/{b.max}</span></div>
                <div className="ws-bar-track"><div style={{ width: `${(b.points / b.max) * 100}%` }} /></div>
                <small>{b.detail}</small>
              </div>
            ))}
          </div>
        </div>
        <ul className="ws-recos">
          {c.recommendations.slice(0, 5).map((r) => <li key={r}><Sparkles size={13} /> {r}</li>)}
        </ul>
      </Card>
      <Card title={`Approbations en attente (${pending.length})`} actions={<button className="ws-link" onClick={() => goTo("approbations")}>Tout voir</button>}>
        {pending.length ? pending.slice(0, 4).map((a) => <div key={a.id} className="ws-row"><ShieldAlert size={14} /> {a.title}</div>) : <Empty>Rien à valider.</Empty>}
      </Card>
      <Card title="Démarches de création" actions={<button className="ws-link" onClick={() => goTo("demarches")}>Ouvrir</button>}>
        <div className="ws-progress"><div style={{ width: `${(doneSteps / Math.max(1, snap.checklist.length)) * 100}%` }} /></div>
        <p className="ws-muted">{doneSteps}/{snap.checklist.length} étapes terminées</p>
        {snap.checklist.filter((s) => s.status !== "fait").slice(0, 3).map((s) => <div key={s.id} className="ws-row"><StatusBadge status={s.status} /> {s.title}</div>)}
      </Card>
      <Card title="Prochaines échéances" actions={<button className="ws-link" onClick={() => goTo("conformite")}>Calendrier</button>}>
        {nextObligations.map((o) => <div key={o.id} className="ws-row"><Badge tone="accent">{fmtDate(o.dueDate)}</Badge> {o.title}</div>)}
      </Card>
      <Card title={`Tâches ouvertes (${openTasks.length})`} actions={<button className="ws-link" onClick={() => goTo("taches")}>Ouvrir</button>}>
        {openTasks.length ? openTasks.slice(0, 5).map((t) => <div key={t.id} className="ws-row"><StatusBadge status={t.status} /> {t.title}{t.dueDate && <small className="ws-muted"> · {fmtDate(t.dueDate)}</small>}</div>) : <Empty>Aucune tâche.</Empty>}
      </Card>
      <Card title="Activité récente" actions={<button className="ws-link" onClick={() => goTo("journal")}>Journal</button>}>
        {snap.activity.slice(0, 5).map((a) => <div key={a.id} className="ws-row ws-small"><Badge tone={a.actor === "agent" ? "violet" : "neutral"}>{a.actor}</Badge> {a.details}</div>)}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------- Approbations */

export function Approvals({ snap, memberId, refresh, notify }: TabProps) {
  const { busy, run } = useAction(refresh, notify);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const pending = snap.approvals.filter((a) => a.status === "en_attente");
  const done = snap.approvals.filter((a) => a.status !== "en_attente");
  const decide = (id: string, decision: "approuver" | "rejeter") =>
    run(id, () => api(`/api/workspace/approvals/${id}`, "POST", { decision, memberId, note: notes[id] }), decision === "approuver" ? (snap.mail.mode === "simulation" ? "Validé — email envoyé en simulation" : "Validé — email envoyé") : "Rejeté");
  return (
    <div className="ws-stack">
      <div className="ws-info">
        <ShieldAlert size={16} /> Aucune action externe ne part sans validation humaine. Mode d&apos;envoi : <strong>{snap.mail.mode === "simulation" ? "simulation (aucun envoi réel)" : `réel via ${snap.mail.provider}`}</strong>
        {snap.mail.warning && <span className="ws-error"> — {snap.mail.warning}</span>}
      </div>
      {pending.length === 0 && <Empty>Aucune action en attente. Demandez à l&apos;agent de contacter un fournisseur ou d&apos;écrire un email.</Empty>}
      {pending.map((a) => {
        const email = snap.emails.find((e) => e.id === a.emailId);
        return (
          <Card key={a.id} title={a.title} actions={<>{a.module && <Badge tone="violet">{a.module}</Badge>}{email?.channel && email.channel !== "email" && <Badge tone="accent">{email.channel} (démo)</Badge>}<Badge tone="amber">{a.type.replace(/_/g, " ")}</Badge></>}>
            <LegalGreenLight check={a.legalCheck} />
            {email && (
              <div className="ws-email-preview">
                <div><span>À</span> {email.to.join(", ")}</div>
                <div><span>Objet</span> {email.subject}</div>
                <pre>{email.body}</pre>
              </div>
            )}
            <div className="ws-approve-bar">
              <input placeholder="Note (optionnelle)" value={notes[a.id] ?? ""} onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })} />
              <button className="ws-btn ws-btn-ghost" disabled={busy === a.id} onClick={() => void decide(a.id, "rejeter")}><X size={15} /> Rejeter</button>
              <button className="ws-btn ws-btn-primary" disabled={busy === a.id} onClick={() => void decide(a.id, "approuver")}><Check size={15} /> Valider et envoyer</button>
            </div>
            <small className="ws-muted">Demandé par {a.requestedBy} · {fmtDate(a.createdAt, true)}</small>
          </Card>
        );
      })}
      {done.length > 0 && (
        <Card title="Historique des décisions">
          <table className="ws-table">
            <thead><tr><th>Action</th><th>Décision</th><th>Par</th><th>Date</th></tr></thead>
            <tbody>{done.map((a) => <tr key={a.id}><td>{a.title}</td><td><StatusBadge status={a.status} /></td><td>{a.decidedBy}</td><td>{fmtDate(a.decidedAt, true)}</td></tr>)}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Boîte d'envoi */

export function Outbox({ snap }: TabProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const email = snap.emails.find((e) => e.id === selected) ?? snap.emails[0];
  if (!snap.emails.length) return <Empty>Boîte d&apos;envoi vide.</Empty>;
  return (
    <div className="ws-split">
      <div className="ws-list">
        {snap.emails.map((e) => (
          <button key={e.id} className={`ws-list-item ${email?.id === e.id ? "is-active" : ""}`} onClick={() => setSelected(e.id)}>
            <div className="ws-list-top"><Mail size={14} /> <strong>{e.subject}</strong></div>
            <div className="ws-list-sub"><StatusBadge status={e.status} /> <span>{e.to.join(", ")}</span></div>
          </button>
        ))}
      </div>
      {email && (
        <Card title={email.subject} actions={<StatusBadge status={email.status} />}>
          <div className="ws-email-preview">
            <div><span>De</span> {snap.mail.from}</div>
            <div><span>À</span> {email.to.join(", ")}</div>
            <div><span>Créé</span> {fmtDate(email.createdAt, true)} par {email.createdBy}</div>
            {email.sentAt && <div><span>Envoyé</span> {fmtDate(email.sentAt, true)} via {email.provider}{email.status === "simule" && " — simulation, aucun message réel n'est parti"}</div>}
            {email.error && <div className="ws-error"><span>Erreur</span> {email.error}</div>}
            <pre>{email.body}</pre>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ---------------------------------------------------- Fournisseurs & devis */

export function Suppliers({ snap, refresh, notify }: TabProps) {
  const { busy, run } = useAction(refresh, notify);
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [need, setNeed] = useState("");
  const [quantity, setQuantity] = useState("");
  const categories = [...new Set(snap.suppliers.map((s) => s.category))];
  const list = snap.suppliers.filter((s) => (!category || s.category === category) && (!filter || `${s.name} ${s.services.join(" ")}`.toLowerCase().includes(filter.toLowerCase())));
  const answered = snap.quotes.filter((q) => q.response);
  const best = answered.length ? answered.reduce((a, b) => (a.response!.amount <= b.response!.amount ? a : b)) : null;
  const supplierName = (id: string) => snap.suppliers.find((s) => s.id === id)?.name ?? id;
  return (
    <div className="ws-stack">
      <Card title={`Suivi des devis (${snap.quotes.length})`}>
        {snap.quotes.length === 0 ? (
          <Empty>Aucune demande. Sélectionnez des fournisseurs ci-dessous ou demandez à l&apos;agent.</Empty>
        ) : (
          <table className="ws-table">
            <thead><tr><th>Fournisseur</th><th>Besoin</th><th>Statut</th><th>Réponse</th><th>Relances</th><th /></tr></thead>
            <tbody>
              {snap.quotes.map((q) => (
                <tr key={q.id} className={best?.id === q.id ? "is-best" : ""}>
                  <td>{supplierName(q.supplierId)}</td>
                  <td className="ws-small">{q.need}</td>
                  <td><StatusBadge status={q.status} /></td>
                  <td>{q.response ? <>{fmtMoney(q.response.amount)} · {q.response.delayDays} j {best?.id === q.id && <Badge tone="green">Meilleur prix</Badge>} {q.response.simulated && <Badge tone="violet">simulée</Badge>}</> : "—"}</td>
                  <td>{q.followUpCount}</td>
                  <td className="ws-actions">
                    {q.status === "envoyee" && (
                      <>
                        <button className="ws-btn ws-btn-sm" disabled={busy === q.id} onClick={() => void run(q.id, () => api(`/api/workspace/quotes/${q.id}`, "POST", { action: "relancer" }), "Relance préparée (à valider)")}><RefreshCw size={13} /> Relancer</button>
                        <button className="ws-btn ws-btn-sm" disabled={busy === q.id} title="Seed : simule la réponse du fournisseur" onClick={() => void run(q.id, () => api(`/api/workspace/quotes/${q.id}`, "POST", { action: "simuler_reponse" }), "Réponse simulée reçue")}>Simuler réponse</button>
                      </>
                    )}
                    {q.status === "reponse_recue" && (
                      <>
                        <button className="ws-btn ws-btn-sm ws-btn-primary" onClick={() => void run(q.id, () => api(`/api/workspace/quotes/${q.id}`, "POST", { action: "accepter" }), "Devis accepté")}>Accepter</button>
                        <button className="ws-btn ws-btn-sm" onClick={() => void run(q.id, () => api(`/api/workspace/quotes/${q.id}`, "POST", { action: "refuser" }), "Devis refusé")}>Refuser</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="Annuaire fournisseurs" actions={<ExampleBadge />}>
        <div className="ws-toolbar">
          <div className="ws-search"><Search size={14} /><input placeholder="Rechercher un service…" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Toutes catégories</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="ws-suppliers">
          {list.map((s) => (
            <label key={s.id} className={`ws-supplier ${picked.includes(s.id) ? "is-picked" : ""}`}>
              <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((p) => p !== s.id))} />
              <div>
                <strong>{s.name}</strong>
                <small>{s.category} · {s.city} · ★ {s.rating}</small>
                <p>{s.description}</p>
                <div className="ws-tags">{s.services.map((x) => <span key={x}>{x}</span>)}</div>
              </div>
            </label>
          ))}
        </div>
        <div className="ws-quote-form">
          <input placeholder="Besoin (ex. 10 motos de livraison 125 cc)" value={need} onChange={(e) => setNeed(e.target.value)} />
          <input placeholder="Quantité" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          <button
            className="ws-btn ws-btn-primary"
            disabled={!picked.length || !need.trim() || busy === "quote"}
            onClick={() =>
              void run("quote", async () => {
                await api("/api/workspace/quotes", "POST", { companyId: snap.company.id, supplierIds: picked, need, quantity });
                setPicked([]);
                setNeed("");
                setQuantity("");
              }, "Demandes de devis créées — à valider dans Approbations")
            }
          >
            <Send size={15} /> Demander un devis ({picked.length})
          </button>
        </div>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------- Démarches */

export function Checklist({ snap, refresh, notify }: TabProps) {
  const { run } = useAction(refresh, notify);
  return (
    <div className="ws-stack">
      <div className="ws-info"><ExampleBadge /> Étapes juridiques : chaque étape affiche son fondement dans le corpus officiel fourni par l&apos;État, ou « non couvert par le corpus » si aucun texte disponible ne la décrit. Les intitulés d&apos;étapes sont des exemples génériques à confirmer.</div>
      {snap.checklist.map((s) => (
        <Card key={s.id} className={`ws-step is-${s.status}`} title={<>{s.order}. {s.title}</>} actions={
          <select value={s.status} onChange={(e) => void run(s.id, () => api(`/api/workspace/checklist/${s.id}`, "PATCH", { status: e.target.value }), "Démarche mise à jour")}>
            <option value="a_faire">À faire</option><option value="en_cours">En cours</option><option value="fait">Fait</option><option value="bloque">Bloqué</option>
          </select>
        }>
          <p>{s.description}</p>
          <div className="ws-row ws-small"><strong>Interlocuteur :</strong> {s.authority}</div>
          <div className="ws-tags">{s.documents.map((d) => <span key={d}>{d}</span>)}</div>
          {s.note && <p className="ws-muted">Note : {s.note}</p>}
          <StepBasis query={`${s.title} ${s.authority}`} />
        </Card>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- Documents */

const GENERATORS: [string, string][] = [
  ["business_plan", "Business plan"],
  ["roadmap", "Roadmap 6 mois"],
  ["statuts", "Statuts"],
  ["contrat_prestation", "Contrat de prestation"],
  ["nda", "NDA"],
  ["contrat_travail", "Contrat de travail"],
  ["pv_ag", "PV d'AG"],
];

export function Documents({ snap, refresh, notify }: TabProps) {
  const { busy, run } = useAction(refresh, notify);
  const [selected, setSelected] = useState<string | null>(null);
  const doc = snap.documents.find((d) => d.id === selected) ?? snap.documents[0];
  return (
    <div className="ws-stack">
      <div className="ws-toolbar">
        {GENERATORS.map(([key, label]) => (
          <button key={key} className="ws-btn ws-btn-sm" disabled={busy === key} onClick={() => void run(key, () => api("/api/workspace/documents", "POST", { companyId: snap.company.id, generate: key }), `${label} généré`)}>
            <FilePlus2 size={13} /> {label}
          </button>
        ))}
      </div>
      {snap.documents.length === 0 ? <Empty>Aucun document.</Empty> : (
        <div className="ws-split">
          <div className="ws-list">
            {snap.documents.map((d) => (
              <button key={d.id} className={`ws-list-item ${doc?.id === d.id ? "is-active" : ""}`} onClick={() => setSelected(d.id)}>
                <div className="ws-list-top"><strong>{d.title}</strong></div>
                <div className="ws-list-sub"><Badge>{d.kind.replace("_", " ")}</Badge>{d.needsReview && <Badge tone="amber">À valider</Badge>}<span>{fmtDate(d.updatedAt)}</span></div>
              </button>
            ))}
          </div>
          {doc && (
            <Card title={doc.title} actions={<button className="ws-btn ws-btn-sm" onClick={() => { void navigator.clipboard.writeText(doc.content); notify("Copié", "info"); }}>Copier</button>}>
              <Markdown text={doc.content} />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Juridique */

type LegalResult = LegalSearch & { grounding: { status: "fonde" | "partiel" | "non_couvert"; label: string } };

export function Legal({ notify }: TabProps) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<LegalResult | null>(null);
  const [loading, setLoading] = useState(false);
  async function search() {
    if (q.trim().length < 3) return;
    setLoading(true);
    try {
      setRes(await api<LegalResult>(`/api/workspace/legal?q=${encodeURIComponent(q)}`));
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "error");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="ws-stack">
      <div className="ws-info">Recherche directe dans le corpus officiel indexé (PDF de <code>reglementation/</code>, <code>publications/</code>, <code>corpus/officiel/</code>). Les extraits d&apos;exemple sont signalés. Pour une explication rédigée, posez la question à l&apos;agent.</div>
      <form className="ws-toolbar" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <div className="ws-search ws-grow"><Search size={14} /><input placeholder="Ex. licence pour services postaux, homologation des terminaux…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="ws-btn ws-btn-primary" disabled={loading}>Rechercher</button>
      </form>
      {res && !res.indexReady && <p className="ws-error">Index PDF absent : lancez <code>npm run index-documents</code>.</p>}
      {res && (
        <div className={`ws-grounding ${res.grounding.status === "fonde" ? "is-fonde" : res.grounding.status === "partiel" ? "is-partiel" : "is-non-couvert"}`}>
          <strong>{res.grounding.status === "non_couvert" ? "⚠️ Non couvert par le corpus officiel : aucun texte disponible ne traite précisément cette question." : `⚖️ ${res.grounding.label}`}</strong>
        </div>
      )}
      {res?.citations.map((c) => (
        <Card key={c.id} className={c.isExample ? "is-example" : ""} title={c.legalTitle ?? c.title} actions={c.isExample ? <ExampleBadge /> : c.file.endsWith(".pdf") ? <a className="ws-link" href={`/api/document?file=${encodeURIComponent(c.file)}#page=${c.page}`} target="_blank" rel="noreferrer">PDF p. {c.page} <ExternalLink size={12} /></a> : null}>
          <small className="ws-muted">{c.category} · page {c.page}{c.articles.length ? ` · articles ${c.articles.join(", ")}` : ""}</small>
          <p className="ws-excerpt">{c.excerpt}</p>
        </Card>
      ))}
    </div>
  );
}

/* ---------------------------------------------- Conformité & calendrier */

export function Compliance({ snap, refresh, notify }: TabProps) {
  const { run } = useAction(refresh, notify);
  const now = Date.now();
  return (
    <div className="ws-stack">
      <Card title="Calendrier des obligations" actions={<><ExampleBadge /><button className="ws-btn ws-btn-sm" onClick={() => void run("sync", () => api("/api/workspace/obligations/sync", "POST", { companyId: snap.company.id }), "Rappels synchronisés dans les tâches")}>Créer les rappels (30 j)</button></>}>
        <table className="ws-table">
          <thead><tr><th /><th>Obligation</th><th>Catégorie</th><th>Échéance</th><th>Récurrence</th></tr></thead>
          <tbody>
            {snap.obligations.map((o) => {
              const late = !o.done && new Date(o.dueDate).getTime() < now;
              return (
                <tr key={o.id} className={o.done ? "is-done" : late ? "is-late" : ""}>
                  <td><input type="checkbox" checked={o.done} onChange={(e) => void run(o.id, () => api(`/api/workspace/obligations/${o.id}`, "PATCH", { done: e.target.checked }))} /></td>
                  <td><strong>{o.title}</strong><br /><small className="ws-muted">{o.description}</small></td>
                  <td><Badge tone={o.category === "fiscal" ? "accent" : o.category === "social" ? "violet" : o.category === "sectoriel" ? "amber" : "neutral"}>{o.category}</Badge></td>
                  <td>{fmtDate(o.dueDate)} {late && <Badge tone="rose">En retard</Badge>}</td>
                  <td>{o.recurrence}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <Card title="Recommandations de conformité">
        <ul className="ws-recos">{snap.compliance.recommendations.map((r) => <li key={r}><Sparkles size={13} /> {r}</li>)}</ul>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------------- Veille */

export function Watch({ snap }: TabProps) {
  const [data, setData] = useState<{ keywords: string[]; alerts: WatchAlert[] } | null>(null);
  useEffect(() => {
    setData(null);
    void api<{ keywords: string[]; alerts: WatchAlert[] }>(`/api/workspace/watch?companyId=${snap.company.id}`).then(setData).catch(() => setData({ keywords: [], alerts: [] }));
  }, [snap.company.id]);
  if (!data) return <Empty>Analyse du corpus…</Empty>;
  return (
    <div className="ws-stack">
      <div className="ws-info">Mots-clés surveillés : {data.keywords.map((k) => <Badge key={k} tone="accent">{k}</Badge>)} — tout nouveau texte déposé par l&apos;État dans <code>corpus/officiel/</code> remonte en priorité.</div>
      {data.alerts.length === 0 && <Empty>Aucun texte pertinent trouvé (l&apos;index est-il construit ?).</Empty>}
      {data.alerts.map((a) => (
        <Card key={a.source} title={a.title} actions={<>{a.isNewOfficial && <Badge tone="green">Nouveau texte officiel</Badge>}<Badge>pertinence {a.relevance}</Badge></>}>
          <small className="ws-muted">{a.category} · correspond à : {a.matched.join(", ")}</small>
          {a.source.toLowerCase().endsWith(".pdf") && <div><a className="ws-link" href={`/api/document?file=${encodeURIComponent(a.source)}`} target="_blank" rel="noreferrer">Ouvrir le document <ExternalLink size={12} /></a></div>}
        </Card>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------- Tâches */

export function Tasks({ snap, refresh, notify }: TabProps) {
  const { run } = useAction(refresh, notify);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const columns = useMemo(() => (["a_faire", "en_cours", "fait"] as const).map((st) => ({ st, items: snap.tasks.filter((t) => t.status === st) })), [snap.tasks]);
  return (
    <div className="ws-stack">
      <form className="ws-toolbar" onSubmit={(e) => { e.preventDefault(); void run("new", async () => { await api("/api/workspace/tasks", "POST", { companyId: snap.company.id, title, dueDate: due || undefined }); setTitle(""); setDue(""); }, "Tâche créée"); }}>
        <input className="ws-grow" placeholder="Nouvelle tâche" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        <button className="ws-btn ws-btn-primary" disabled={!title.trim()}>Ajouter</button>
      </form>
      <div className="ws-kanban">
        {columns.map(({ st, items }) => (
          <div key={st} className="ws-column">
            <h4><StatusBadge status={st} /> {items.length}</h4>
            {items.map((t) => (
              <div key={t.id} className="ws-task">
                <strong>{t.title}</strong>
                <small className="ws-muted">{t.source}{t.dueDate ? ` · ${fmtDate(t.dueDate)}` : ""}</small>
                <select value={t.status} onChange={(e) => void run(t.id, () => api(`/api/workspace/tasks/${t.id}`, "PATCH", { status: e.target.value }))}>
                  <option value="a_faire">À faire</option><option value="en_cours">En cours</option><option value="fait">Fait</option>
                </select>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- Équipe */

export function Team({ snap, refresh, notify }: TabProps) {
  const { run } = useAction(refresh, notify);
  const [form, setForm] = useState({ name: "", email: "", role: "membre" });
  return (
    <div className="ws-stack">
      <Card title="Membres du workspace">
        <table className="ws-table">
          <thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Depuis</th></tr></thead>
          <tbody>{snap.members.map((m) => <tr key={m.id}><td>{m.name}</td><td>{m.email}</td><td><Badge tone={m.role === "proprietaire" ? "violet" : m.role === "admin" ? "accent" : "neutral"}>{m.role}</Badge></td><td>{fmtDate(m.createdAt)}</td></tr>)}</tbody>
        </table>
        <p className="ws-muted">Rôles : propriétaire / admin / membre peuvent valider les actions externes ; lecteur en lecture seule.</p>
      </Card>
      <Card title="Inviter un membre">
        <form className="ws-toolbar" onSubmit={(e) => { e.preventDefault(); void run("member", async () => { await api("/api/workspace/members", "POST", { companyId: snap.company.id, ...form }); setForm({ name: "", email: "", role: "membre" }); }, "Membre ajouté"); }}>
          <input placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="admin">Admin</option><option value="membre">Membre</option><option value="lecteur">Lecteur</option>
          </select>
          <button className="ws-btn ws-btn-primary">Ajouter</button>
        </form>
        <p className="ws-muted">Aucune invitation n&apos;est envoyée par email (pas d&apos;authentification dans cette version).</p>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------------- Journal */

export function Journal({ snap }: TabProps) {
  return (
    <Card title="Journal d'audit (actions de l'agent et des membres)">
      <table className="ws-table">
        <thead><tr><th>Date</th><th>Acteur</th><th>Action</th><th>Détail</th></tr></thead>
        <tbody>{snap.activity.map((a) => <tr key={a.id}><td className="ws-nowrap">{fmtDate(a.createdAt, true)}</td><td><Badge tone={a.actor === "agent" ? "violet" : a.actor === "system" ? "neutral" : "accent"}>{a.actor}</Badge></td><td><code>{a.action}</code></td><td>{a.details}</td></tr>)}</tbody>
      </table>
    </Card>
  );
}

type StepBasisResult = { citations: Citation[]; grounding: { status: "fonde" | "partiel" | "non_couvert"; label: string } };

/** Fondement juridique d'une étape, cherché dans le corpus officiel (route gratuite /api/workspace/legal). */
function StepBasis({ query }: { query: string }) {
  const [res, setRes] = useState<StepBasisResult | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    api<StepBasisResult>(`/api/workspace/legal?limit=2&q=${encodeURIComponent(query)}`)
      .then((r) => alive && setRes(r))
      .catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [query]);
  if (err) return <div className="ws-step-basis ws-muted">Fondement indisponible : {err}</div>;
  if (!res) return <div className="ws-step-basis ws-muted">Recherche du fondement juridique…</div>;
  const official = res.citations.filter((c) => !c.isExample);
  return (
    <div className={`ws-grounding ws-step-basis ${res.grounding.status === "fonde" ? "is-fonde" : res.grounding.status === "partiel" ? "is-partiel" : "is-non-couvert"}`}>
      <strong>{res.grounding.status === "non_couvert" ? "⚠️ Non couvert par le corpus officiel" : `⚖️ ${res.grounding.label}`}</strong>
      {res.grounding.status !== "non_couvert" && official[0] && (
        <p>
          « {official[0].excerpt.slice(0, 220).trim()}… »{" "}
          {official[0].file.toLowerCase().endsWith(".pdf") && (
            <a href={`/api/document?file=${encodeURIComponent(official[0].file)}#page=${official[0].page}`} target="_blank" rel="noreferrer">Ouvrir le texte</a>
          )}
        </p>
      )}
    </div>
  );
}

/** Feu vert juridique affiché dans la carte d'approbation : articles du corpus officiel liés à l'action. */
export function LegalGreenLight({ check }: { check?: import("@/lib/workspace/types").LegalCheck }) {
  if (!check) return <div className="ws-grounding ws-muted">⏳ Feu vert juridique en cours de calcul…</div>;
  const official = check.sources.filter((x) => !x.isExample);
  const tone = check.status === "fonde" ? "is-fonde" : check.status === "partiel" ? "is-partiel" : "is-non-couvert";
  const title = check.status === "fonde" ? "🟢 Feu vert juridique : textes applicables identifiés" : check.status === "partiel" ? "🟠 Feu orange : textes partiellement applicables" : "⚪ Non couvert par le corpus officiel : vérifiez avec un professionnel";
  return (
    <div className={`ws-grounding ws-legal-light ${tone}`} role="note" aria-label="Feu vert juridique">
      <strong>{title}</strong>
      {check.status !== "non_couvert" && official.length > 0 && (
        <ul>
          {official.map((x) => (
            <li key={x.id}>
              {x.document} · p. {x.page}
              {x.articles.length > 0 && ` · art. ${x.articles.slice(0, 3).join(", ")}`}{" "}
              {x.file.toLowerCase().endsWith(".pdf") && <a href={`/api/document?file=${encodeURIComponent(x.file)}#page=${x.page}`} target="_blank" rel="noreferrer">ouvrir</a>}
            </li>
          ))}
        </ul>
      )}
      <small className="ws-muted">Contrôle informatif (lexical) : la décision reste humaine.</small>
    </div>
  );
}
