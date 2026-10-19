"use client";

import { Download, FileText, Mic, Play, Printer, Rewind, Square, Upload, Users } from "lucide-react";
import { useRef, useState } from "react";
import type { TabProps } from "@/components/workspace/Tabs";
import { api, Badge, Card, Empty, ExampleBadge, fmtDate } from "@/components/workspace/ui";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { AudioSpeakerButton } from "@/components/voice/AudioSpeakerButton";
import type { Missed } from "@/lib/modules/memoire/meetings";
import type { Meeting, MeetingAnalysis } from "@/lib/modules/memoire/types";
import { useMemoire } from "./useMemoire";
import "./memoire.css";

type Transcription = { text: string; provider: string; demo: boolean; notice?: string };

/** Onglet « Salle de réunion » : saisie texte / dictée / audio, analyse, tâches, ce que j'ai manqué, PV. */
export default function ReunionsPanel({ snap, memberId, refresh, notify, goTo }: TabProps) {
  const { data, error, reload } = useMemoire(snap.company.id);
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [participants, setParticipants] = useState<string[]>(snap.members.map((m) => m.name));
  const [transcript, setTranscript] = useState("");
  const [source, setSource] = useState<Meeting["source"]>("texte");
  const [transcription, setTranscription] = useState<Transcription | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);

  async function run<T>(key: string, fn: () => Promise<T>, ok?: string): Promise<T | null> {
    setBusy(key);
    try {
      const r = await fn();
      if (ok) notify(ok);
      return r;
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "error");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function transcribe(blob: Blob, name: string) {
    const form = new FormData();
    form.append("companyId", snap.company.id);
    form.append("audio", blob, name);
    const r = await run("audio", async () => {
      const res = await fetch("/api/memoire/transcribe", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Erreur ${res.status}`);
      return body as Transcription;
    });
    if (r) {
      setTranscription(r);
      setTranscript(r.text);
      setSource("audio");
      notify(r.demo ? "Transcription de DÉMO (aucune clé configurée)" : `Transcrit par ${r.provider}`, r.demo ? "info" : "success");
    }
  }

  async function toggleRecord() {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void transcribe(new Blob(chunks, { type: rec.mimeType || "audio/webm" }), "reunion.webm");
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch {
      notify("Micro indisponible : autorisez l'accès ou importez un fichier audio.", "error");
    }
  }

  async function create(finalize: boolean) {
    const body = { companyId: snap.company.id, memberId, title: title || `Réunion du ${new Date().toLocaleDateString("fr-FR")}`, transcript, participants, source, transcription: transcription ? { provider: transcription.provider, demo: transcription.demo } : undefined, finalize };
    const r = await run("create", () => api<{ meeting: Meeting }>("/api/memoire/meetings", "POST", body), finalize ? "Réunion analysée : décisions au registre, tâches créées" : "Réunion ouverte");
    if (r) {
      setSelected(r.meeting.id);
      setTitle("");
      setTranscript("");
      setTranscription(null);
      await reload();
      if (finalize) await refresh();
    }
  }

  if (error) return <Card title="Salle de réunion"><p>{error}</p></Card>;
  const meetings = data?.meetings ?? [];
  const current = meetings.find((m) => m.id === selected) ?? null;

  return (
    <div className="mem">
      <Card title={<><Users size={16} /> Nouvelle réunion</>} actions={data && <Badge tone={data.transcription.demo ? "violet" : "green"}>{data.transcription.demo ? "Transcription audio : démo" : `Transcription : ${data.transcription.providers.join(", ")}`}</Badge>}>
        <div className="mem-row">
          <input className="mem-grow" placeholder="Titre de la réunion" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="mem-row mem-participants">
          {snap.members.map((m) => (
            <label key={m.id}><input type="checkbox" checked={participants.includes(m.name)} onChange={(e) => setParticipants(e.target.checked ? [...participants, m.name] : participants.filter((p) => p !== m.name))} /> {m.name}</label>
          ))}
        </div>
        <textarea rows={8} value={transcript} onChange={(e) => { setTranscript(e.target.value); if (source === "audio") setSource("texte"); }} placeholder={"Collez ou dictez la transcription. Format conseillé :\n[00:01] Awa : On a décidé de…\n[00:03] Paul : Je vais demander trois devis d'ici vendredi."} />
        {transcription?.demo && <p className="mem-warn">⚠️ {transcription.notice}</p>}
        <div className="mem-row">
          <span className="mem-voice"><VoiceInputButton onTranscript={(t) => { setTranscript(t); setSource("dictee"); }} /> Dictée</span>
          <button className="ws-btn" onClick={() => void toggleRecord()} disabled={busy === "audio"}>{recording ? <><Square size={14} /> Arrêter l&apos;enregistrement</> : <><Mic size={14} /> Enregistrer l&apos;audio</>}</button>
          <label className="ws-btn"><Upload size={14} /> Importer un audio<input type="file" accept="audio/*,video/webm" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void transcribe(f, f.name); e.target.value = ""; }} /></label>
          {busy === "audio" && <span className="ws-muted">Transcription…</span>}
        </div>
        <div className="mem-row">
          <button className="ws-btn" disabled={!!busy} onClick={() => void create(false)}><Play size={14} /> Ouvrir en direct</button>
          <button className="ws-btn ws-btn-primary" disabled={!!busy || !transcript.trim()} onClick={() => void create(true)}>{busy === "create" ? "Analyse…" : "Analyser et clôturer"}</button>
        </div>
      </Card>

      <div className="mem-split">
        <Card title="Réunions">
          {!meetings.length ? <Empty>Aucune réunion.</Empty> : (
            <ul className="mem-list">
              {meetings.map((m) => (
                <li key={m.id} className={m.id === selected ? "is-active" : ""}>
                  <button onClick={() => setSelected(m.id)}>
                    <strong>{m.title}</strong> {m.isExample && <ExampleBadge />}
                    <span className="ws-muted">{fmtDate(m.date, true)} · {m.status === "en_cours" ? "en cours" : `${m.decisionIds.length} décision(s), ${m.taskIds.length} tâche(s)`}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {current ? <MeetingView key={current.id} meeting={current} snap={snap} memberId={memberId} busy={busy} run={run} reload={reload} refresh={refresh} goTo={goTo} /> : <Card title="Détail"><Empty>Sélectionnez une réunion.</Empty></Card>}
      </div>
    </div>
  );
}

function MeetingView({ meeting, snap, memberId, busy, run, reload, refresh, goTo }: {
  meeting: Meeting;
  snap: TabProps["snap"];
  memberId: string;
  busy: string | null;
  run: <T>(key: string, fn: () => Promise<T>, ok?: string) => Promise<T | null>;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  goTo: (t: string) => void;
}) {
  const [line, setLine] = useState("");
  const [preview, setPreview] = useState<MeetingAnalysis | null>(null);
  const [since, setSince] = useState("");
  const [missed, setMissed] = useState<Missed | null>(null);
  const me = snap.members.find((m) => m.id === memberId);
  const analysis = meeting.analysis ?? preview;
  const live = meeting.status === "en_cours";
  const url = `/api/memoire/meetings/${meeting.id}`;

  async function append() {
    if (!line.trim()) return;
    const ok = await run("append", () => api(url, "PATCH", { text: line, speaker: me?.name.split(" ")[0] }));
    if (ok) {
      setLine("");
      await reload();
    }
  }

  return (
    <Card title={<>{meeting.title} {meeting.isExample && <ExampleBadge />}</>} actions={<Badge tone={live ? "amber" : "green"}>{live ? "En cours" : "Terminée"}</Badge>}>
      <p className="ws-muted">{fmtDate(meeting.date, true)} · {meeting.participants.join(", ") || "participants non renseignés"} · source : {meeting.source}{meeting.transcription?.demo ? " (transcription de DÉMO)" : meeting.transcription ? ` (${meeting.transcription.provider})` : ""}</p>
      <details open={live}><summary>Transcription ({meeting.transcript.split("\n").filter(Boolean).length} lignes)</summary><pre className="mem-transcript">{meeting.transcript || "—"}</pre></details>
      {live && (
        <div className="mem-row">
          <input className="mem-grow" value={line} onChange={(e) => setLine(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void append(); }} placeholder="Ajouter une intervention (ou dictez)…" />
          <VoiceInputButton onTranscript={setLine} />
          <button className="ws-btn" onClick={() => void append()} disabled={busy === "append"}>Ajouter</button>
        </div>
      )}
      <div className="mem-row">
        {live && <button className="ws-btn" disabled={!!busy} onClick={async () => { const r = await run("preview", () => api<{ analysis: MeetingAnalysis }>(url, "POST", { action: "apercu", memberId })); if (r) setPreview(r.analysis); }}>Résumé en direct</button>}
        {live && <button className="ws-btn ws-btn-primary" disabled={!!busy || !meeting.transcript.trim()} onClick={async () => { const r = await run("close", () => api(url, "POST", { action: "cloturer", memberId }), "Réunion clôturée : décisions et tâches créées"); if (r) { await reload(); await refresh(); } }}>{busy === "close" ? "Analyse…" : "Clôturer et créer les tâches"}</button>}
        <span className="mem-row mem-missed">
          <input placeholder="arrivé à mm:ss" value={since} onChange={(e) => setSince(e.target.value)} size={10} />
          <button className="ws-btn" disabled={!!busy} onClick={async () => { const r = await run("missed", () => api<Missed>(url, "POST", { action: "manque", since: since || "50%" })); if (r) setMissed(r); }}><Rewind size={14} /> Ce que j&apos;ai manqué</button>
        </span>
      </div>
      {missed && (
        <div className="mem-answer">
          <div className="mem-answer-head"><strong>Ce que vous avez manqué</strong><AudioSpeakerButton text={`${missed.summary} ${missed.decisions.join(". ")}`} /></div>
          <p>{missed.summary}</p>
          {missed.decisions.length > 0 && <ul>{missed.decisions.map((d) => <li key={d}>Décision : {d}</li>)}</ul>}
          {missed.actions.length > 0 && <ul>{missed.actions.map((a) => <li key={a.title}>Action : {a.title}{a.assignee ? ` → ${a.assignee}` : ""}{a.dueDate ? ` (${a.dueDate})` : ""}</li>)}</ul>}
        </div>
      )}
      {analysis && (
        <div className="mem-analysis">
          <div className="mem-answer-head"><h4>Résumé {preview && !meeting.analysis ? "(aperçu, rien n'est enregistré)" : ""}</h4><Badge tone={analysis.mode === "llm" ? "green" : "violet"}>{analysis.mode === "llm" ? `IA · ${analysis.provider}` : "Règles (démo)"}</Badge><AudioSpeakerButton text={analysis.summary} /></div>
          <p>{analysis.summary}</p>
          {analysis.keyPoints.length > 0 && <ul>{analysis.keyPoints.map((k) => <li key={k}>{k}</li>)}</ul>}
          <h4>Décisions</h4>
          {analysis.decisions.length ? <ul>{analysis.decisions.map((d) => <li key={d.title}><strong>{d.title}</strong>{d.rationale ? ` — ${d.rationale}` : ""}</li>)}</ul> : <Empty>Aucune décision détectée.</Empty>}
          {meeting.decisionIds.length > 0 && <button className="ws-link" onClick={() => goTo("memoire")}>Voir au registre des décisions (avec fondement juridique)</button>}
          <h4>Tâches {meeting.analysis ? "créées" : "proposées"}</h4>
          {analysis.actions.length ? (
            <table className="mem-table"><thead><tr><th>Action</th><th>Responsable</th><th>Échéance</th></tr></thead>
              <tbody>{analysis.actions.map((a) => <tr key={a.title}><td>{a.title}</td><td>{a.assigneeName ?? "à désigner"}</td><td>{a.dueDate ?? "—"}</td></tr>)}</tbody></table>
          ) : <Empty>Aucune action détectée.</Empty>}
          {meeting.taskIds.length > 0 && <button className="ws-link" onClick={() => goTo("taches")}>Ouvrir les tâches</button>}
        </div>
      )}
      {!live && (
        <div className="mem-row">
          <button className="ws-btn" disabled={!!busy} onClick={async () => { const r = await run("pv", () => api(url, "POST", { action: "pv", memberId }), "PV enregistré dans Documents"); if (r) { await reload(); await refresh(); } }}><FileText size={14} /> {meeting.pvDocumentId ? "Mettre à jour le PV" : "Enregistrer le PV"}</button>
          <a className="ws-btn" href={`${url}/pv?format=md`}><Download size={14} /> PV (.md)</a>
          <a className="ws-btn" href={`${url}/pv?format=html`} target="_blank" rel="noreferrer"><Printer size={14} /> PV imprimable / PDF</a>
        </div>
      )}
    </Card>
  );
}
