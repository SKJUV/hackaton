import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "./setup-db";
import { analyzeTranscriptDemo, joinIndex, parseDueDate, parseTranscript } from "@/lib/modules/memoire/analyze";
import { askMemory, listDecisions, recordDecision, searchMemory, buildMemoryIndex } from "@/lib/modules/memoire/memory";
import { analyzeMeeting, appendToMeeting, createMeeting, getMeetingPv, recordMeeting, savePvDocument, whatIMissed } from "@/lib/modules/memoire/meetings";
import { ensureMemoireSeed, SEED_TRANSCRIPT } from "@/lib/modules/memoire/seed";
import { computeScore } from "@/lib/modules/memoire/score";
import { canonicalJson, getSigningKey, parsePrivateKey, signPayload, verifyPayload } from "@/lib/modules/memoire/signing";
import { getPublicAttestation, issueAttestation, revokeAttestation, verifyAttestationParts } from "@/lib/modules/memoire/attestations";
import { shortenAnswer, liteBriefing } from "@/lib/modules/memoire/lite";
import { transcribeAudio } from "@/lib/modules/memoire/transcribe";
import { memoireIntents } from "@/lib/modules/memoire/demo";
import { detectIntents } from "@/lib/agent/demo-planner";
import { runAgent } from "@/lib/agent/runner";
import { ALL_TOOLS as TOOLS, DEMO_INTENTS, TOOL_MAP } from "@/lib/agent/registry";
import { readMemo } from "@/lib/modules/memoire/store";
import { resetDemoData, withData } from "@/lib/workspace/store";
import { moduleState } from "@/lib/modules/state";
import { getSnapshot } from "@/lib/workspace/service";
import { readData } from "@/lib/workspace/store";
import { generateKeyPairSync } from "node:crypto";

const PEOPLE = [
  { id: "m1", name: "Freddy Choudja" },
  { id: "m2", name: "Awa Mbarga (démo)" },
  { id: "m3", name: "Paul Etoa (démo)" },
];

describe("salle de réunion — analyse démo", () => {
  it("parse horodatage, orateur et texte", () => {
    const l = parseTranscript("[01:30] Awa : Bonjour à tous\nTexte libre");
    expect(l[0]).toMatchObject({ time: "01:30", seconds: 90, speaker: "Awa", text: "Bonjour à tous" });
    expect(l[1].speaker).toBeUndefined();
  });

  it("extrait décisions, actions assignées et échéances", () => {
    const base = new Date("2026-10-05T10:00:00Z");
    const a = analyzeTranscriptDemo(SEED_TRANSCRIPT, PEOPLE, base);
    expect(a.mode).toBe("demo");
    expect(a.decisions.map((d) => d.title)).toEqual([expect.stringMatching(/SARL/), expect.stringMatching(/livraison de colis/)]);
    expect(a.decisions[0].title).not.toMatch(/\bcar\b/);
    expect(a.decisions[0].rationale).toMatch(/trois associés/);
    const statuts = a.actions.find((x) => /statuts/i.test(x.title))!;
    expect(statuts).toMatchObject({ assigneeId: "m2", dueDate: "2026-10-12" });
    expect(statuts.title).toBe("Rédiger le projet de statuts de la SARL");
    const devis = a.actions.find((x) => /devis/i.test(x.title))!;
    expect(devis.assigneeId).toBe("m3"); // « Je vais… » prononcé par Paul
    expect(a.actions.find((x) => /corpus/i.test(x.title))?.assigneeId).toBe("m1");
  });

  it("échéances relatives en français", () => {
    const base = new Date("2026-10-19T08:00:00Z"); // lundi
    expect(parseDueDate("d'ici vendredi", base)).toBe("2026-10-23");
    expect(parseDueDate("avant le 25/10/2026", base)).toBe("2026-10-25");
    expect(parseDueDate("dans 2 semaines", base)).toBe("2026-11-02");
    expect(parseDueDate("sans date", base)).toBeUndefined();
  });

  it("point d'arrivée : horodatage, ligne, pourcentage", () => {
    const lines = parseTranscript(SEED_TRANSCRIPT);
    expect(joinIndex(lines, "00:12")).toBe(5);
    expect(joinIndex(lines, "3")).toBe(3);
    expect(joinIndex(lines, "50%")).toBe(Math.round(lines.length / 2));
  });
});

describe("module mémoire (workspace)", () => {
  beforeEach(useTempDb);
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GROQ_API_KEY;
    delete process.env.LLM_PROVIDER;
    delete process.env.COFOUNDER_SCORE_SIGNING_KEY;
  });

  it("seed idempotent : réunion, décisions et tâches assignées de démo", async () => {
    await ensureMemoireSeed("co_kmerlog");
    await ensureMemoireSeed("co_kmerlog");
    const data = await readData();
    expect(readMemo(data).meetings.filter((m) => m.companyId === "co_kmerlog")).toHaveLength(1);
    const decisions = await listDecisions("co_kmerlog");
    expect(decisions.length).toBe(3);
    expect(decisions.every((d) => d.isExample)).toBe(true);
    const meetingTasks = data.tasks.filter((t) => readMemo(data).meetings[0].taskIds.includes(t.id));
    expect(meetingTasks).toHaveLength(3);
    expect(meetingTasks.every((t) => t.assigneeId)).toBe(true);
    // Les entreprises sans seed ne reçoivent rien.
    await ensureMemoireSeed("co_afritel");
    expect((await listDecisions("co_afritel")).length).toBe(0);
  });

  it("« Pourquoi avons-nous choisi cette structure juridique ? » → décision + sources + textes figés", async () => {
    const r = await askMemory("co_kmerlog", "Pourquoi avons-nous choisi cette structure juridique ?");
    expect(r.mode).toBe("demo");
    expect(r.decisions[0].title).toBe("Structure juridique : SARL");
    expect(r.hits[0].ref.type).toBe("decision");
    expect(r.answer).toMatch(/registre des décisions/);
    expect(r.answer).toMatch(/trois associés/);
    expect(r.answer).toMatch(/Textes consultés au moment de la décision/);
    expect(r.answer).toMatch(/Réunion « Réunion de lancement/);
    // L'instantané juridique est soit sourcé, soit explicitement « non couvert » — jamais inventé.
    const legal = r.decisions[0].legal;
    if (legal.status === "non_couvert") expect(r.answer).toMatch(/Non couvert/);
    else expect(legal.sources.some((s) => !s.isExample && s.file)).toBe(true);
  });

  it("répond honnêtement quand la mémoire ne contient rien", async () => {
    const r = await askMemory("co_afritel", "Pourquoi avons-nous choisi ce fournisseur de fibre ?");
    expect(r.hits.filter((h) => h.ref.type === "decision")).toHaveLength(0);
  });

  it("LLM (fetch simulé) : synthèse à partir des éléments uniquement", async () => {
    process.env.GROQ_API_KEY = "test";
    process.env.LLM_PROVIDER = "groq";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "Nous avons choisi la SARL [M1]." } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await askMemory("co_kmerlog", "Pourquoi la SARL ?");
    expect(r.mode).toBe("llm");
    expect(r.answer).toContain("[M1]");
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.messages[0].content).toMatch(/UNIQUEMENT à partir des éléments/);
  });

  it("enregistre une décision avec instantané juridique et l'indexe", async () => {
    const d = await recordDecision("co_afritel", { title: "Licence d'exploitation", decision: "Demander une licence pour le réseau sans fil", rationale: "Activité de communications électroniques" });
    expect(d.legal.capturedAt).toBeTruthy();
    const data = await readData();
    const hits = searchMemory(buildMemoryIndex(data, "co_afritel"), "licence réseau sans fil");
    expect(hits[0].ref.id).toBe(d.id);
    expect(data.activity.some((a) => a.action === "decision.enregistrement")).toBe(true);
  });

  it("réunion en direct : dictée, aperçu sans écriture, clôture idempotente, PV exportable", async () => {
    const m = await createMeeting("co_kmerlog", { title: "Point hebdo", participants: ["Freddy Choudja", "Awa Mbarga (démo)"], source: "dictee" });
    await appendToMeeting(m.id, "On a décidé de recruter deux livreurs car la demande augmente", "Freddy");
    await appendToMeeting(m.id, "Awa doit publier l'offre d'emploi avant le 30/10/2026");
    const before = (await readData()).tasks.length;
    const preview = await analyzeMeeting(m.id, { finalize: false });
    expect(preview.analysis.actions).toHaveLength(1);
    expect((await readData()).tasks.length).toBe(before);
    const done = await analyzeMeeting(m.id, { finalize: true });
    expect(done.meeting.status).toBe("terminee");
    const data = await readData();
    const task = data.tasks.find((t) => t.id === done.meeting.taskIds[0])!;
    expect(task).toMatchObject({ assigneeId: "mem_awa" });
    expect(task.dueDate?.slice(0, 10)).toBe("2026-10-30");
    await expect(analyzeMeeting(m.id, { finalize: true })).rejects.toThrow(/déjà clôturée/);
    await expect(appendToMeeting(m.id, "trop tard")).rejects.toThrow(/clôturée/);
    const pv = await getMeetingPv(m.id);
    expect(pv.markdown).toMatch(/# Procès-verbal de réunion — Point hebdo/);
    expect(pv.markdown).toMatch(/\| Publier l'offre d'emploi \| Awa Mbarga \(démo\) \| 2026-10-30 \|/);
    const doc = await savePvDocument(m.id);
    const doc2 = await savePvDocument(m.id);
    expect(doc2.id).toBe(doc.id);
    expect(doc.kind).toBe("pv");
  });

  it("« ce que j'ai manqué » dans une réunion et dans l'entreprise", async () => {
    const r = await recordMeeting("co_kmerlog", { title: "Lancement bis", transcript: SEED_TRANSCRIPT, participants: [] });
    const late = await whatIMissed("co_kmerlog", { meetingId: r.meeting.id, since: "00:16" });
    expect(late.decisions).toHaveLength(2);
    expect(late.actions).toHaveLength(0);
    const early = await whatIMissed("co_kmerlog", { meetingId: r.meeting.id, since: "00:00" });
    expect(early.summary).toMatch(/rien manqué/);
    const global = await whatIMissed("co_kmerlog", { since: "2000-01-01" });
    expect(global.decisions.length).toBeGreaterThanOrEqual(5);
  });

  it("score calculé depuis le journal : délais, engagements, objectifs, décisions", async () => {
    await ensureMemoireSeed("co_kmerlog");
    const s = computeScore(await readData(), "co_kmerlog");
    const delais = s.components.find((c) => c.key === "delais")!;
    expect(delais.evidence.taches_a_temps).toBe(1); // statuts clôturés avant l'échéance (journal)
    expect(delais.evidence.taches_en_retard).toBe(1); // devis clôturés après l'échéance
    expect(s.components.find((c) => c.key === "objectifs")!.score).toBe(22); // 2/9 démarches
    expect(s.score).toBeGreaterThan(0);
    expect(s.score).toBeLessThanOrEqual(100);
    const empty = computeScore(await readData(), "co_inexistante");
    expect(empty.score).toBe(0);
    expect(empty.level).toBe("insuffisant");
  });

  it("signature Ed25519 : clé de dev générée, attestation vérifiable, falsification détectée, révocation", async () => {
    const key = getSigningKey();
    expect(key.source).toBe("dev");
    const att = await issueAttestation("co_kmerlog");
    expect(att.payload.demo).toBe(true);
    const pub = await getPublicAttestation(att.id);
    expect(pub?.verification.valid).toBe(true);
    const forged = { ...att.payload, score: 99 };
    expect(verifyAttestationParts(forged, att.signature, att.publicKeyPem).signatureValid).toBe(false);
    const other = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(verifyAttestationParts(att.payload, att.signature, other).valid).toBe(false);
    await revokeAttestation(att.id);
    const after = await getPublicAttestation(att.id);
    expect(after?.verification).toMatchObject({ signatureValid: true, revoked: true, valid: false });
    expect(await getPublicAttestation("att_inconnue")).toBeNull();
    expect(await getPublicAttestation("../etc")).toBeNull();
  });

  it("clé via l'environnement (PEM échappé ou graine base64) et JSON canonique", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString().replace(/\n/g, "\\n");
    process.env.COFOUNDER_SCORE_SIGNING_KEY = pem;
    const k = getSigningKey();
    expect(k.source).toBe("env");
    const sig = signPayload({ b: 1, a: [2, { d: 1, c: 2 }] }, k);
    expect(verifyPayload({ a: [2, { c: 2, d: 1 }], b: 1 }, sig, k.publicKeyPem)).toBe(true);
    expect(canonicalJson({ b: 1, a: undefined, c: null })).toBe('{"b":1,"c":null}');
    const seed = Buffer.alloc(32, 7).toString("base64");
    expect(parsePrivateKey(seed).asymmetricKeyType).toBe("ed25519");
  });

  it("mode bas débit : réponses courtes et résumé vocal", async () => {
    const long = "## Titre\n" + "Ceci est une phrase assez longue pour le test [S1]. ".repeat(20);
    const r = shortenAnswer(long, 120);
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(120);
    expect(r.text).not.toMatch(/##/);
    const b = await liteBriefing("co_kmerlog");
    expect(b.split(/(?<=\.)\s/).length).toBeLessThanOrEqual(3);
    expect(b).toMatch(/Score Co-founder/);
  });

  it("transcription : démo marquée sans clé, Groq Whisper avec clé (fetch simulé)", async () => {
    const audio = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
    const demo = await transcribeAudio(audio);
    expect(demo.demo).toBe(true);
    expect(demo.notice).toMatch(/EXEMPLE/);
    process.env.GROQ_API_KEY = "test";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: "Bonjour la réunion" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const real = await transcribeAudio(audio);
    expect(real).toMatchObject({ text: "Bonjour la réunion", demo: false });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect((init.body as FormData).get("model")).toBe("whisper-large-v3-turbo");
  });
});

describe("agent : outils du module", () => {
  beforeEach(useTempDb);

  it("outils enregistrés, uniques, avec schéma", () => {
    for (const name of ["memoire_interroger", "memoire_registre_decisions", "memoire_enregistrer_decision", "memoire_reunion_analyser", "memoire_reunion_lister", "memoire_ce_que_jai_manque", "memoire_reunion_pv", "memoire_score", "memoire_score_attester", "memoire_resume_vocal"]) {
      expect(TOOL_MAP.get(name)?.parameters.type).toBe("object");
    }
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
  });

  it("intentions exclusives : une transcription ne déclenche ni devis ni email", () => {
    const t = "Réunion produit\n[00:01] Paul : il faut des devis fournisseurs\n[00:02] Awa : j'envoie un mail à a@b.com";
    expect(memoireIntents(t)).toEqual(["reunion_analyse"]);
    const norm = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const matched = DEMO_INTENTS.filter((i) => i.test.test(norm));
    expect(matched.map((i) => [i.name, Boolean(i.exclusive)])).toEqual([["memoire_reunion", true]]);
    expect(memoireIntents("Pourquoi avons-nous choisi cette structure juridique ?")).toEqual(["memoire"]);
    expect(memoireIntents("Émets une attestation de mon score Co-founder")).toEqual(["score_attester"]);
    expect(memoireIntents("Génère le PV de la dernière réunion")).toEqual(["pv"]);
    expect(memoireIntents("Quel est mon score de conformité ?")).toBeNull();
    expect(detectIntents("Quel est mon score de conformité ?")).toContain("conformite");
  });

  it("mode démo : question de mémoire → recherche juridique puis mémoire", async () => {
    const { company } = await getSnapshot("co_kmerlog");
    const reply = await runAgent(company, [{ role: "user", content: "Pourquoi avons-nous choisi cette structure juridique ?" }]);
    expect(reply.toolTrace.map((t) => t.tool)).toEqual(["rechercher_textes_juridiques", "memoire_interroger"]);
    expect(reply.answer).toMatch(/Structure juridique : SARL/);
  });

  it("mode démo : transcription collée → tâches créées, aucune approbation externe", async () => {
    const { company } = await getSnapshot("co_kmerlog");
    const reply = await runAgent(company, [{ role: "user", content: `Analyse la réunion commerciale. Transcription :\n${SEED_TRANSCRIPT}` }]);
    expect(reply.toolTrace.map((t) => t.tool)).toEqual(["rechercher_textes_juridiques", "memoire_reunion_analyser"]);
    const snap = await getSnapshot("co_kmerlog");
    expect(snap.approvals).toHaveLength(0);
    expect(reply.answer).toMatch(/Tâches créées/);
  });

  it("mode démo : attestation signée avec lien /verifier", async () => {
    const { company } = await getSnapshot("co_kmerlog");
    const reply = await runAgent(company, [{ role: "user", content: "Émets une attestation signée de mon score Co-founder pour un investisseur" }]);
    expect(reply.answer).toMatch(/\/verifier\/att_/);
  });
});

describe("bas débit : réponse abrégée", () => {
  it("retire le paragraphe « Base juridique » de tête et coupe proprement", async () => {
    const { liteAnswer } = await import("@/lib/modules/memoire/lite");
    const r = liteAnswer("**Base juridique : Loi X, p. 3, art. 4.**\n\n🧠 Mémoire — 2 éléments. D'après le registre : SARL adoptée. Autre phrase.", 60);
    expect(r.text).not.toMatch(/Base juridique/);
    expect(r.text.startsWith("🧠 Mémoire")).toBe(true);
    expect(shortenAnswer("Voir p. 127, art. 34 du texte. Suite.", 200).text).toBe("Voir p. 127, art. 34 du texte. Suite.");
  });
});

describe("conventions : moduleState, réinitialisation et données des autres modules", () => {
  beforeEach(useTempDb);

  it("les données vivent dans data.modules.memoire ; la réinitialisation conserve les vraies entreprises et ré-applique le seed", async () => {
    await ensureMemoireSeed("co_kmerlog");
    await withData((d) => {
      d.companies.push({ ...d.companies.find((c) => c.id === "co_kmerlog")!, id: "co_reelle", name: "Entreprise réelle", isExample: false });
    });
    await recordDecision("co_reelle", { title: "Choix de la banque", decision: "Compte ouvert dans une banque locale." }, "test");
    let data = await readData();
    expect((data as unknown as { memoire?: unknown }).memoire).toBeUndefined();
    expect(data.modules?.memoire).toBeDefined();
    await resetDemoData();
    data = await readData();
    const m = readMemo(data);
    expect(m.decisions.filter((d) => d.companyId === "co_reelle")).toHaveLength(1);
    expect(m.decisions.filter((d) => d.companyId === "co_kmerlog")).toHaveLength(0);
    await ensureMemoireSeed("co_kmerlog");
    expect((await listDecisions("co_kmerlog")).length).toBe(3);
  });

  it("la mémoire indexe aussi les collections des autres modules (ex. choix de structure)", async () => {
    await withData((d) => {
      moduleState(d, "structure_test", () => ({ choices: [] as { id: string; companyId: string; title: string; motif: string }[] })).choices.push({ id: "stc_test01", companyId: "co_kmerlog", title: "Choix de forme : SAS", motif: "entrée d'investisseurs prévue" });
    });
    const items = buildMemoryIndex(await readData(), "co_kmerlog");
    const hit = searchMemory(items, "pourquoi investisseurs SAS")[0];
    expect(hit.ref).toMatchObject({ type: "module", module: "structure_test", id: "stc_test01" });
    expect(buildMemoryIndex(await readData(), "co_afritel").some((i) => i.ref.id === "stc_test01")).toBe(false);
  });

  it("mode démo : « PV de la réunion » est exclusif (pas de PV d'assemblée générale du cœur)", async () => {
    await ensureMemoireSeed("co_kmerlog");
    const { company } = await getSnapshot("co_kmerlog");
    const reply = await runAgent(company, [{ role: "user", content: "Génère le PV de la dernière réunion" }]);
    const tools = reply.toolTrace.map((t) => t.tool);
    expect(tools).toContain("memoire_reunion_pv");
    expect(tools).not.toContain("generer_document_juridique");
  });
});
