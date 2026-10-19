import type { Metadata } from "next";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { getPublicAttestation } from "@/lib/modules/memoire/attestations";
import { LEVEL_LABEL, METHODOLOGY } from "@/lib/modules/memoire/score";
import "../verifier.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vérifier une attestation — Score Co-founder", robots: { index: false } };

const fmt = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Africa/Douala", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const EVIDENCE: Record<string, string> = {
  taches_a_temps: "tâches terminées à temps",
  taches_en_retard: "tâches en retard",
  obligations_faites: "obligations faites",
  obligations_en_retard: "obligations en retard",
  exclues_non_verifiables: "exclues (clôture non journalisée)",
  exclues_non_echues: "exclues (non échues)",
  actions_reunion_tenues: "actions de réunion tenues",
  actions_reunion_echues_non_faites: "actions de réunion échues non faites",
  approbations_sous_7_jours: "approbations traitées sous 7 jours",
  approbations_tardives: "approbations tardives",
  demarches_terminees: "démarches terminées",
  demarches_prevues: "démarches prévues",
  decisions: "décisions",
  motivees: "motivées",
  avec_source: "reliées à une source",
  avec_texte_officiel: "avec texte officiel",
};

/** Page PUBLIQUE de vérification d'une attestation du Score Co-founder (aucune connexion requise). */
export default async function VerifierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const att = await getPublicAttestation(id);
  if (!att) {
    return (
      <div className="vf-page">
        <main className="vf">
          <p className="vf-brand">Co-founder · Vérification</p>
          <div className="vf-status vf-ko"><strong>Attestation introuvable.</strong> Vérifiez le lien ou le QR code.</div>
        </main>
      </div>
    );
  }
  const h = await headers();
  const base = process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
  const url = `${base}/verifier/${att.id}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const p = att.payload;
  const v = att.verification;
  return (
    <div className="vf-page">
    <main className="vf">
      <div className="vf-head">
        <div>
          <p className="vf-brand">Co-founder · Attestation de Score</p>
          <h1 style={{ margin: ".2rem 0" }}>{p.company.name}</h1>
          <p className="vf-muted">{p.company.sector}</p>
        </div>
        <div className="vf-qr" aria-label={`QR code vers ${url}`} dangerouslySetInnerHTML={{ __html: qr }} />
      </div>

      <div className={`vf-status ${v.valid ? "vf-ok" : "vf-ko"}`}>
        {v.valid ? <strong>✔ Attestation authentique et en cours de validité.</strong> : <strong>✖ Attestation non valide.</strong>}
        <div>Signature Ed25519 : {v.signatureValid ? "valide" : "invalide"} · Clé : {v.keyKnown ? "publiée par Co-founder" : "inconnue"} · {v.revoked ? "révoquée" : v.expired ? "expirée" : "non révoquée"}</div>
        {v.reasons.map((r) => <div key={r}>{r}</div>)}
      </div>
      {p.demo && <div className="vf-warn">⚠️ Attestation de DÉMONSTRATION : {p.company.isExample ? "entreprise fictive (données de démo)" : ""}{p.company.isExample && att.keySource === "dev" ? " · " : ""}{att.keySource === "dev" ? "signée avec une clé de développement" : ""}. Elle ne prouve rien sur une entreprise réelle.</div>}

      <div className="vf-score">
        <div className="vf-big">{p.score}<span style={{ fontSize: "1.2rem" }}>/100</span></div>
        <div>
          <strong>{LEVEL_LABEL[p.level]}</strong>
          <div className="vf-muted">Calculé le {fmt(p.computedAt)} (heure de Douala) · émis le {fmt(p.issuedAt)} · valable jusqu&apos;au {fmt(p.expiresAt)}</div>
        </div>
      </div>

      <h2>Détail du calcul</h2>
      <table>
        <thead><tr><th>Critère</th><th>Poids</th><th>Note</th><th>Données</th></tr></thead>
        <tbody>
          {p.components.map((c) => (
            <tr key={c.key}>
              <td>{c.label}</td>
              <td>{Math.round(c.weight * 100)} %</td>
              <td>{c.score === null ? "—" : `${c.score}/100`}</td>
              <td className="vf-muted">{Object.entries(c.evidence).map(([k, n]) => `${n} ${EVIDENCE[k] ?? k}`).join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Méthodologie (version {p.methodologyVersion})</h2>
      <p>{METHODOLOGY.intro}</p>
      <ul>{METHODOLOGY.criteria.map((c) => <li key={c.key}><strong>{c.label} ({Math.round(c.weight * 100)} %)</strong> — {c.rule}</li>)}</ul>
      <p>{METHODOLOGY.aggregation}</p>
      <p>{METHODOLOGY.signature}</p>
      {p.methodologyVersion !== METHODOLOGY.version && <div className="vf-warn">Cette attestation a été calculée avec la méthodologie {p.methodologyVersion} ; la version actuelle est {METHODOLOGY.version}.</div>}

      <h2>Preuve cryptographique</h2>
      <p className="vf-muted">Identifiant : <code>{p.id}</code> · Clé : <code>{p.keyId}</code> · Contenu signé et signature en JSON : <a href={`/api/verifier/${p.id}`}>/api/verifier/{p.id}</a> · Clé publique : <a href="/api/verifier/cle">/api/verifier/cle</a></p>
      <p className="vf-muted">Vérification hors ligne : reconstituez le JSON canonique du champ <code>payload</code> (clés triées, sans espaces) et vérifiez la signature Ed25519 (base64url) avec la clé publique ci-dessous.</p>
      <pre>{att.signature}</pre>
      <pre>{att.publicKeyPem}</pre>
    </main>
    </div>
  );
}
