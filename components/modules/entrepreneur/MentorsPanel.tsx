"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import { Badge, Card, Empty, ExampleBadge, fmtDate, StatusBadge } from "@/components/workspace/ui";
import type { PanelProps } from "./shared";

export function MentorsPanel({ ent, act, busy, goTo }: PanelProps) {
  const [skills, setSkills] = useState("");
  const [custom, setCustom] = useState<{ id: string; score: number; secteurs: string[]; competences: string[] }[] | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const byId = new Map(ent.mentorCatalog.map((m) => [m.id, m]));
  const rows = custom
    ? custom.flatMap((c) => { const mentor = byId.get(c.id); return mentor ? [{ mentor, score: c.score, sectorHits: c.secteurs, skillHits: c.competences }] : []; })
    : ent.mentors.rows;
  async function search() {
    const r = await act<{ mentors: { id: string; score: number; secteurs: string[]; competences: string[] }[] }>("mentor_rechercher", { competences: skills.split(",").map((s) => s.trim()).filter(Boolean) });
    if (r) setCustom(r.data.mentors);
  }
  return (
    <div className="ws-stack">
      <div className="ws-info">Réseau de mentors : les profils affichés sont des <b>exemples fictifs</b> en attendant les partenariats réels. Le matching repose sur le secteur et les compétences recherchées (par défaut : les compétences manquantes de l&apos;équipe), pas sur le réseau de connaissances.</div>
      <Card title="Compétences recherchées">
        <div className="ent-row">
          <input placeholder={ent.mentors.skillsSought.slice(0, 6).join(", ")} value={skills} onChange={(e) => setSkills(e.target.value)} />
          <button className="ws-btn ws-btn-primary" style={{ flex: "none" }} disabled={busy === "mentor_rechercher"} onClick={() => void search()}>Trouver des mentors</button>
        </div>
      </Card>
      <div className="ent-card-grid">
        {rows.map(({ mentor: m, score, sectorHits, skillHits }) => (
          <div key={m.id} className="ent-mini">
            <h4>{m.name} <ExampleBadge /> <Badge tone="accent">{score}/100</Badge> {m.diaspora && <Badge tone="violet">diaspora</Badge>}</h4>
            <p>{m.headline}</p>
            <p className="ent-muted">{m.location} · {m.languages.join(", ")} · {m.availability}</p>
            <p className="ent-muted">Secteurs : {sectorHits.join(", ") || "généraliste"} · Compétences : {skillHits.join(", ") || "—"}</p>
            <textarea rows={2} placeholder="Message personnalisé (facultatif)" value={msg[m.id] ?? ""} onChange={(e) => setMsg({ ...msg, [m.id]: e.target.value })} />
            <button className="ws-btn ws-btn-sm ws-btn-primary" disabled={busy === "mentor_demander_mise_en_relation"} onClick={() => void act("mentor_demander_mise_en_relation", { mentor_id: m.id, message: msg[m.id] }, "Demande placée dans la file d'approbation")}><Send size={13} /> Demander une mise en relation</button>
          </div>
        ))}
      </div>
      <Card title={`Demandes de mise en relation (${ent.mentorRequests.length})`} actions={<button className="ws-btn ws-btn-sm" onClick={() => goTo("approbations")}>Approbations</button>}>
        {!ent.mentorRequests.length ? <Empty>Aucune demande.</Empty> : (
          <table className="ws-table">
            <thead><tr><th>Mentor</th><th>Date</th><th>Approbation</th><th>Email</th></tr></thead>
            <tbody>{ent.mentorRequests.map((r) => <tr key={r.id}><td>{r.mentorName}</td><td>{fmtDate(r.createdAt)}</td><td><StatusBadge status={r.approvalStatus} /></td><td><StatusBadge status={r.emailStatus} /></td></tr>)}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
