"use client";

import { Badge, fmtDate } from "@/components/workspace/ui";
import type { LegalSnapshot } from "@/lib/modules/memoire/types";
import { pdfHref } from "./useMemoire";

/** Textes de loi consultés AU MOMENT de la décision (instantané figé). */
export function LegalSnapshotView({ legal }: { legal: LegalSnapshot }) {
  const official = legal.sources.filter((s) => !s.isExample);
  const examples = legal.sources.filter((s) => s.isExample);
  return (
    <div className="mem-legal">
      <div className="mem-legal-head">
        <Badge tone={legal.status === "fonde" ? "green" : legal.status === "partiel" ? "amber" : "rose"}>{legal.label}</Badge>
        <span className="ws-muted">Textes consultés le {fmtDate(legal.capturedAt, true)}</span>
      </div>
      {legal.status === "non_couvert" || !official.length ? (
        <p className="ws-muted">⚠️ Aucun texte du corpus officiel ne couvrait ce point au moment de la décision (« {legal.query} »). Rien n&apos;a été inventé.</p>
      ) : (
        <ul>
          {official.map((s, i) => {
            const href = pdfHref(s.file, s.page);
            return (
              <li key={i}>
                {href ? <a href={href} target="_blank" rel="noreferrer">{s.document}</a> : s.document} — page {s.page}
                {s.articles.length ? `, art. ${s.articles.slice(0, 4).join(", ")}` : ""}
                <details><summary>Extrait cité</summary><blockquote>{s.excerpt}</blockquote></details>
              </li>
            );
          })}
        </ul>
      )}
      {examples.map((s, i) => <p key={`ex${i}`} className="ws-muted">⚠️ Texte d&apos;EXEMPLE, non officiel — {s.document}</p>)}
    </div>
  );
}
