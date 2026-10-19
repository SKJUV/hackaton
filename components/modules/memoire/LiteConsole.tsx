"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { AudioSpeakerButton } from "@/components/voice/AudioSpeakerButton";

type Reply = { text: string; truncated: boolean; basis: string | null; sources: { id: string; doc: string; page: number; art: string[] }[]; tools: string[]; mode: string };
type Item = { id: string; q: string; reply?: Reply; error?: string; queued?: boolean; at: string };
const QUEUE_KEY = "cofounder-lite-queue";
const HISTORY_KEY = "cofounder-lite-history";

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/\[S\d+\]/g, ""));
  u.lang = "fr-FR";
  window.speechSynthesis.speak(u);
}

/**
 * Console bas débit : réponses courtes, aucune image, dictée vocale, lecture vocale automatique (option),
 * file d'attente hors ligne (localStorage) envoyée au retour du réseau. Le service worker de la PWA
 * met la page en cache pour qu'elle s'ouvre sans connexion.
 */
export function LiteConsole({ companyId: initial }: { companyId?: string }) {
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [companyId, setCompanyId] = useState(initial ?? "");
  const [briefing, setBriefing] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [online, setOnline] = useState(true);
  const [autoRead, setAutoRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const flushing = useRef(false);

  const save = (list: Item[]) => {
    setItems(list);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 20)));
  };

  useEffect(() => {
    setOnline(navigator.onLine);
    setAutoRead(localStorage.getItem("cofounder-lite-autoread") === "1");
    try {
      setItems(JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"));
    } catch {
      /* historique illisible */
    }
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!online) return;
    const wanted = companyId || localStorage.getItem("ws-company") || "";
    fetch(`/api/memoire/lite${wanted ? `?companyId=${encodeURIComponent(wanted)}` : ""}`)
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error || `Erreur ${r.status}`);
        setCompanies(b.companies);
        setCompanyId(b.companyId);
        setBriefing(b.briefing);
        setError("");
      })
      .catch((e: Error) => setError(e.message));
  }, [online, companyId]);

  const ask = useCallback(async (question: string, cid: string): Promise<Reply> => {
    const r = await fetch("/api/memoire/lite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: cid, message: question }) });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error || `Erreur ${r.status}`);
    return b as Reply;
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return;
    let queue: { id: string; q: string; companyId: string }[] = [];
    try {
      queue = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
    } catch {
      queue = [];
    }
    if (!queue.length) return;
    flushing.current = true;
    for (const job of queue) {
      try {
        const reply = await ask(job.q, job.companyId);
        setItems((list) => {
          const next = list.map((it) => (it.id === job.id ? { ...it, reply, queued: false } : it));
          localStorage.setItem(HISTORY_KEY, JSON.stringify(next.slice(0, 20)));
          return next;
        });
        queue = queue.filter((x) => x.id !== job.id);
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      } catch {
        break;
      }
    }
    flushing.current = false;
  }, [ask]);

  useEffect(() => {
    if (online) void flush();
  }, [online, flush]);

  async function submit() {
    const question = q.trim();
    if (question.length < 2 || !companyId) return;
    setQ("");
    const item: Item = { id: `${Date.now()}`, q: question, at: new Date().toISOString() };
    if (!navigator.onLine) {
      const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
      localStorage.setItem(QUEUE_KEY, JSON.stringify([...queue, { id: item.id, q: question, companyId }]));
      save([{ ...item, queued: true }, ...items]);
      return;
    }
    setBusy(true);
    try {
      const reply = await ask(question, companyId);
      save([{ ...item, reply }, ...items]);
      if (autoRead) speak(reply.text);
    } catch (e) {
      save([{ ...item, error: e instanceof Error ? e.message : "Erreur" }, ...items]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lite">
      <p className="lite-status">{online ? "● En ligne" : "○ Hors ligne — vos questions sont mises en file et partiront au retour du réseau."}</p>
      {companies.length > 1 && (
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Entreprise">
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      {error && <p className="lite-err">{error}</p>}
      {briefing && (
        <p className="lite-brief">{briefing} <AudioSpeakerButton text={briefing} /></p>
      )}
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="lite-form">
        <textarea rows={2} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Votre question (ou dictez)…" />
        <div className="lite-actions">
          <VoiceInputButton onTranscript={setQ} disabled={busy} />
          <button type="submit" disabled={busy || q.trim().length < 2}>{busy ? "…" : online ? "Envoyer" : "Mettre en file"}</button>
          <label><input type="checkbox" checked={autoRead} onChange={(e) => { setAutoRead(e.target.checked); localStorage.setItem("cofounder-lite-autoread", e.target.checked ? "1" : "0"); }} /> Lire les réponses à voix haute</label>
        </div>
      </form>
      <ol className="lite-items">
        {items.map((it) => (
          <li key={it.id}>
            <p className="lite-q">{it.q}</p>
            {it.queued && <p className="lite-muted">En file d&apos;attente (hors ligne)…</p>}
            {it.error && <p className="lite-err">{it.error}</p>}
            {it.reply && (
              <>
                <p>{it.reply.text}{it.reply.truncated ? " …" : ""} <AudioSpeakerButton text={it.reply.text} /></p>
                {it.reply.basis && <p className="lite-muted">⚖️ {it.reply.basis}</p>}
                {it.reply.sources.length > 0 && <p className="lite-muted">{it.reply.sources.map((s) => `[${s.id}] ${s.doc}, p. ${s.page}${s.art.length ? `, art. ${s.art.join(", ")}` : ""}`).join(" · ")}</p>}
                <p className="lite-muted">{it.reply.mode === "demo" ? "Mode démo" : "IA"}{it.reply.truncated ? " · réponse abrégée (réponse complète dans l'onglet Agent)" : ""}</p>
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
