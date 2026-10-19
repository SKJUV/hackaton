"use client";

import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import type { Citation } from "@/lib/legal/citations";
import type { EntrepreneurSnapshot } from "@/lib/modules/entrepreneur/tools";
import type { ArticleRow } from "@/lib/modules/entrepreneur/types";
import type { TabProps } from "@/components/workspace/Tabs";
import { api, Badge } from "@/components/workspace/ui";

export type ActionResult<T = unknown> = { summary: string; data: T; citations: Citation[] };

export type PanelProps = TabProps & {
  ent: EntrepreneurSnapshot;
  act: <T = unknown>(name: string, body?: Record<string, unknown>, success?: string) => Promise<ActionResult<T> | null>;
  busy: string | null;
};

export function callAction<T>(companyId: string, name: string, body: Record<string, unknown> = {}) {
  return api<ActionResult<T>>(`/api/entrepreneur/${name}`, "POST", { companyId, ...body });
}

export const pdfHref = (file: string, page: number) => `/api/document?file=${encodeURIComponent(file)}#page=${page}`;

/** Tableau « article par article » (sources officielles uniquement). */
export function ArticleTable({ rows }: { rows: ArticleRow[] }) {
  if (!rows.length) return <p className="ent-uncovered">⚠️ Non couvert par le corpus officiel : aucune règle n&apos;est affirmée.</p>;
  return (
    <table className="ws-table ent-articles">
      <thead><tr><th>Source</th><th>Texte</th><th>Article</th><th>Extrait</th></tr></thead>
      <tbody>
        {rows.map((a, i) => (
          <tr key={`${a.source}-${a.article}-${i}`}>
            <td><span className="ws-cite">{a.source}</span></td>
            <td className="ws-small">{a.file.endsWith(".pdf") ? <a className="ws-link" href={pdfHref(a.file, a.page)} target="_blank" rel="noreferrer">{a.document}, p. {a.page} <ExternalLink size={11} /></a> : `${a.document}, p. ${a.page}`}</td>
            <td className="ws-nowrap">{a.article === "—" ? "—" : `art. ${a.article}`}</td>
            <td className="ws-small">« {a.extrait} »</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Basis = { statut: string; libelle: string; sources?: { id: string; document: string; page: number; articles: string[]; exemple_non_officiel: boolean }[] } | null | undefined;

export function BasisLine({ basis }: { basis: Basis }) {
  if (!basis) return null;
  const off = basis.sources?.filter((s) => !s.exemple_non_officiel) ?? [];
  return (
    <div className={`ws-grounding ${basis.statut === "fonde" ? "is-fonde" : basis.statut === "partiel" ? "is-partiel" : "is-non-couvert"}`}>
      <strong>{basis.statut === "non_couvert" ? "⚠️ Non couvert par le corpus officiel" : `⚖️ ${basis.libelle}`}</strong>
      {basis.statut !== "non_couvert" && off.length > 0 && <small> — {off.map((s) => `[${s.id}] ${s.document} p. ${s.page}${s.articles.length ? ` art. ${s.articles.slice(0, 3).join(", ")}` : ""}`).join(" · ")}</small>}
    </div>
  );
}

export function Pill({ ok, children }: { ok: "ok" | "ko" | "a_verifier"; children: ReactNode }) {
  return <Badge tone={ok === "ok" ? "green" : ok === "ko" ? "rose" : "amber"}>{children}</Badge>;
}

export const VERDICT: Record<string, { label: string; tone: "green" | "amber" | "rose" }> = {
  eligible: { label: "Éligible", tone: "green" },
  a_verifier: { label: "À vérifier", tone: "amber" },
  non_eligible: { label: "Non éligible", tone: "rose" },
};
