"use client";

import type { ReactNode } from "react";

export async function api<T = unknown>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Erreur ${res.status}`);
  return data as T;
}

export const fmtDate = (iso?: string, withTime = false) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", {
        timeZone: "Africa/Douala",
        day: "2-digit",
        month: "short",
        year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      })
    : "—";

export const fmtMoney = (n: number, currency = "XAF") => `${new Intl.NumberFormat("fr-FR").format(n)} ${currency}`;

type Tone = "neutral" | "accent" | "green" | "amber" | "rose" | "violet";

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`ws-badge ws-badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function ExampleBadge() {
  return (
    <Badge tone="amber" title="Donnée de démonstration (seed), non officielle">
      Exemple
    </Badge>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`ws-card ${className}`}>
      {(title || actions) && (
        <header className="ws-card-head">
          {title && <h3>{title}</h3>}
          {actions && <div className="ws-card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="ws-empty">{children}</p>;
}

export const STATUS: Record<string, { label: string; tone: Tone }> = {
  a_faire: { label: "À faire", tone: "neutral" },
  en_cours: { label: "En cours", tone: "accent" },
  fait: { label: "Fait", tone: "green" },
  bloque: { label: "Bloqué", tone: "rose" },
  en_attente: { label: "En attente", tone: "amber" },
  approuvee: { label: "Approuvée", tone: "green" },
  rejetee: { label: "Rejetée", tone: "rose" },
  brouillon: { label: "Brouillon", tone: "neutral" },
  en_attente_approbation: { label: "À valider", tone: "amber" },
  envoye: { label: "Envoyé", tone: "green" },
  simule: { label: "Envoyé (simulation)", tone: "violet" },
  echec: { label: "Échec", tone: "rose" },
  rejete: { label: "Rejeté", tone: "rose" },
  envoyee: { label: "Envoyée", tone: "accent" },
  reponse_recue: { label: "Réponse reçue", tone: "violet" },
  acceptee: { label: "Acceptée", tone: "green" },
  refusee: { label: "Refusée", tone: "rose" },
  annulee: { label: "Annulée", tone: "neutral" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inline(s: string) {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[(S\d+)\]/g, '<span class="ws-cite">$1</span>');
}

/** Rendu Markdown minimal et sûr (le texte est échappé avant transformation). */
export function markdownToHtml(md: string): string {
  const lines = escapeHtml(md).split("\n");
  const out: string[] = [];
  let list: "ul" | null = null;
  let table: string[][] | null = null;
  const flushList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  const flushTable = () => {
    if (!table) return;
    const [head, ...rows] = table.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c.trim())));
    out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    table = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\|.*\|$/.test(line.trim())) {
      flushList();
      table = table ?? [];
      table.push(line.trim().slice(1, -1).split("|").map((c) => c.trim()));
      continue;
    }
    flushTable();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushList();
      out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`);
    } else if (/^\s*[-*]\s+/.test(line)) {
      if (!list) {
        list = "ul";
        out.push("<ul>");
      }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+(\[ \]\s*)?/, (_m, box) => (box ? "☐ " : "")))}</li>`);
    } else if (/^&gt;\s?/.test(line)) {
      flushList();
      out.push(`<blockquote>${inline(line.replace(/^&gt;\s?/, ""))}</blockquote>`);
    } else if (!line.trim()) {
      flushList();
    } else {
      flushList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  flushList();
  flushTable();
  return out.join("\n");
}

export function Markdown({ text }: { text: string }) {
  return <div className="ws-md" dangerouslySetInnerHTML={{ __html: markdownToHtml(text) }} />;
}
