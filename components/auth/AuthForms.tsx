"use client";

import { ArrowRight, KeyRound, Loader2, Mail, Sparkles, UserRound, Zap } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { getMe, nextParam, post, queryParam, type Me } from "./client";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="au-page">
      <header className="au-top">
        <a href="/" className="au-brand">⚖️ Droit.cm</a>
        <nav>
          <a href="/">Assistant juridique (gratuit)</a>
          <a href="/tarifs">Tarifs</a>
          <a href="/workspace">Co-fondateur IA</a>
          <a href="/compte">Mon compte</a>
        </nav>
      </header>
      <main className="au-main">
        <div className="au-card">
          <h1>{title}</h1>
          {subtitle && <p className="au-sub">{subtitle}</p>}
          {children}
        </div>
      </main>
    </div>
  );
}

function useBusy() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(queryParam("erreur"));
  return {
    busy,
    error,
    setError,
    async run(fn: () => Promise<void>) {
      setBusy(true);
      setError("");
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      } finally {
        setBusy(false);
      }
    },
  };
}

/** Boutons sans aucune saisie : invité et comptes démo. */
export function QuickAccess({ next }: { next: string }) {
  const [accounts, setAccounts] = useState<{ id: string; name: string; email: string }[]>([]);
  const { busy, error, run } = useBusy();
  useEffect(() => {
    void fetch("/api/auth/demo").then((r) => r.json()).then((d) => setAccounts(d.accounts ?? []));
  }, []);
  return (
    <div className="au-quick">
      <button className="au-btn au-btn-primary au-wide" disabled={busy} onClick={() => void run(async () => { await post("/api/auth/guest"); window.location.href = next; })}>
        <Zap size={16} /> Continuer en démo (sans compte ni mot de passe)
      </button>
      <div className="au-demo-list">
        {accounts.map((a) => (
          <button key={a.id} className="au-btn au-wide" disabled={busy} onClick={() => void run(async () => { await post("/api/auth/demo", { userId: a.id }); window.location.href = next; })}>
            <UserRound size={15} /> {a.name}
          </button>
        ))}
      </div>
      {error && <p className="au-error">{error}</p>}
    </div>
  );
}

/** Saisie email → code (et lien magique). En mode démo, le code est affiché immédiatement. */
export function CodeLogin({ purpose = "connexion", next, name }: { purpose?: "connexion" | "inscription" | "reinitialisation"; next: string; name?: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<{ simulated: boolean; demoCode?: string; demoLink?: string } | null>(null);
  const { busy, error, run } = useBusy();
  async function verify(c = code) {
    const res = await post<{ next: string }>("/api/auth/verify", { email, code: c, next });
    window.location.href = res.next;
  }
  if (!sent) {
    return (
      <form className="au-form" onSubmit={(e: FormEvent) => { e.preventDefault(); void run(async () => setSent(await post("/api/auth/request-code", { email, purpose, name }))); }}>
        <label>Email</label>
        <input type="email" required placeholder="vous@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="au-btn au-btn-primary au-wide" disabled={busy}>{busy ? <Loader2 size={15} className="au-spin" /> : <Mail size={15} />} Recevoir un code / lien magique</button>
        {error && <p className="au-error">{error}</p>}
      </form>
    );
  }
  return (
    <div className="au-form">
      <p className="au-ok">Code envoyé à <strong>{email}</strong>{sent.simulated && " (simulation : aucun email réel)"}.</p>
      {sent.demoCode && (
        <div className="au-demo-code">
          <span>Mode démo — votre code :</span> <strong>{sent.demoCode}</strong>
          <button className="au-btn au-btn-sm" onClick={() => void run(() => verify(sent.demoCode!))}>Utiliser ce code</button>
          {sent.demoLink && <a href={sent.demoLink}>ou ouvrir le lien magique</a>}
          <a href="/connexion/boite-demo" target="_blank">Voir la boîte d&apos;envoi de démo</a>
        </div>
      )}
      <label>Code à 6 chiffres</label>
      <input inputMode="numeric" maxLength={7} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
      <button className="au-btn au-btn-primary au-wide" disabled={busy || code.replace(/\s/g, "").length < 6} onClick={() => void run(() => verify())}><ArrowRight size={15} /> Valider</button>
      <button className="au-link" onClick={() => setSent(null)}>Changer d&apos;email / renvoyer un code</button>
      {error && <p className="au-error">{error}</p>}
    </div>
  );
}

export function LoginPage() {
  const [next, setNext] = useState("/workspace");
  const [showPwd, setShowPwd] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, run } = useBusy();
  useEffect(() => setNext(nextParam()), []);
  return (
    <AuthShell title="Connexion" subtitle="Aucun mot de passe requis. Le chat juridique et la recherche restent accessibles sans compte.">
      <QuickAccess next={next} />
      <div className="au-sep"><span>ou avec votre email</span></div>
      <CodeLogin next={next} />
      <button className="au-link" onClick={() => setShowPwd(!showPwd)}><KeyRound size={13} /> J&apos;ai défini un mot de passe (facultatif)</button>
      {showPwd && (
        <form className="au-form" onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await post<{ next: string }>("/api/auth/password", { email, password, next }); window.location.href = r.next; }); }}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="au-btn au-wide" disabled={busy}>Se connecter avec le mot de passe</button>
          {error && <p className="au-error">{error}</p>}
        </form>
      )}
      <p className="au-foot"><a href={`/inscription?next=${encodeURIComponent(next)}`}>Créer un compte</a> · <a href="/mot-de-passe-oublie">Mot de passe oublié ?</a></p>
    </AuthShell>
  );
}

export function SignupPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const { busy, error, run } = useBusy();
  const [next, setNext] = useState("/workspace");
  useEffect(() => setNext(nextParam()), []);
  return (
    <AuthShell title="Créer un compte" subtitle="Accès immédiat, sans vérification bloquante. Le mot de passe est facultatif.">
      <form className="au-form" onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await post<{ next: string }>("/api/auth/signup", { ...form, next }); window.location.href = r.next; }); }}>
        <label>Nom</label>
        <input placeholder="Votre nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label>Email</label>
        <input type="email" required placeholder="vous@exemple.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <label>Mot de passe <em>(facultatif)</em></label>
        <input type="password" placeholder="Laissez vide pour vous connecter par code email" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button className="au-btn au-btn-primary au-wide" disabled={busy}><Sparkles size={15} /> Créer mon compte</button>
        {error && <p className="au-error">{error}</p>}
      </form>
      <div className="au-sep"><span>ou sans rien saisir</span></div>
      <QuickAccess next={next} />
      <p className="au-foot">Déjà inscrit ? <a href="/connexion">Connexion</a></p>
    </AuthShell>
  );
}

export function ForgotPage() {
  return (
    <AuthShell title="Mot de passe oublié" subtitle="Pas de panique : recevez un code ou un lien magique pour entrer directement. Vous pourrez ensuite définir un nouveau mot de passe — ou vous en passer.">
      <CodeLogin purpose="reinitialisation" next="/compte?reinitialisation=1" />
      <div className="au-sep"><span>ou</span></div>
      <QuickAccess next="/workspace" />
      <p className="au-foot"><a href="/connexion">Retour à la connexion</a></p>
    </AuthShell>
  );
}

export function LogoutPage() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    void post("/api/auth/logout").finally(() => setDone(true));
  }, []);
  return (
    <AuthShell title={done ? "Vous êtes déconnecté(e)" : "Déconnexion…"} subtitle="Le chat juridique, la recherche et la lecture des textes restent disponibles sans compte.">
      <div className="au-quick">
        <a className="au-btn au-btn-primary au-wide" href="/">Continuer vers l&apos;assistant juridique</a>
        <a className="au-btn au-wide" href="/connexion">Se reconnecter</a>
      </div>
    </AuthShell>
  );
}

export function AccountPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const { busy, error, run } = useBusy();
  const load = () => getMe().then(setMe);
  useEffect(() => {
    void load();
  }, []);
  if (!me) return <AuthShell title="Mon compte"><p>Chargement…</p></AuthShell>;
  if (!me.user) {
    return (
      <AuthShell title="Mon compte" subtitle="Vous n'êtes pas connecté(e).">
        <QuickAccess next="/compte" />
        <p className="au-foot"><a href="/connexion?next=/compte">Connexion par email</a></p>
      </AuthShell>
    );
  }
  const reset = queryParam("reinitialisation") === "1";
  return (
    <AuthShell title="Mon compte" subtitle={`${me.user.name} · ${me.user.email}${me.user.kind !== "standard" ? ` · compte ${me.user.kind}` : ""}`}>
      {me.devSecret && <p className="au-error">AUTH_SECRET n&apos;est pas défini en production : un secret de développement est utilisé.</p>}
      <section className="au-section">
        <h2>Abonnement</h2>
        {me.subscription ? (
          <>
            <p><strong>{me.subscription.plan?.name ?? me.subscription.planId}</strong> — actif{me.subscription.currentPeriodEnd && ` jusqu'au ${new Date(me.subscription.currentPeriodEnd).toLocaleDateString("fr-FR", { timeZone: "Africa/Douala" })}`}{me.subscription.simulated && " · paiement simulé (démo)"}</p>
            <div className="au-row">
              <a className="au-btn au-btn-primary" href="/workspace">Ouvrir le co-fondateur IA</a>
              <button className="au-btn" disabled={busy} onClick={() => void run(async () => { await post("/api/billing/cancel"); await load(); setMsg("Abonnement résilié."); })}>Résilier</button>
            </div>
          </>
        ) : (
          <>
            <p>Plan <strong>Gratuit</strong> : chat juridique, recherche et lecture des textes.</p>
            <a className="au-btn au-btn-primary" href="/tarifs">Découvrir le co-fondateur IA</a>
          </>
        )}
        {!me.paywall && <p className="au-muted">Paywall désactivé (BILLING_PAYWALL=off) : l&apos;assistant est ouvert à tous.</p>}
      </section>
      <section className="au-section">
        <h2>Mot de passe <em>(facultatif)</em></h2>
        {reset && <p className="au-ok">Vous êtes connecté(e) via le lien de réinitialisation. Définissez un nouveau mot de passe si vous le souhaitez.</p>}
        <p className="au-muted">{me.user.hasPassword ? "Un mot de passe est défini." : "Aucun mot de passe : vous vous connectez par code email, lien magique ou en un clic."}</p>
        <div className="au-row">
          <input type="password" placeholder="Nouveau mot de passe (6+ caractères)" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="au-btn" disabled={busy || password.length < 6} onClick={() => void run(async () => { await post("/api/auth/set-password", { password }); setPassword(""); await load(); setMsg("Mot de passe enregistré."); })}>Enregistrer</button>
          {me.user.hasPassword && <button className="au-btn" disabled={busy} onClick={() => void run(async () => { await post("/api/auth/set-password", { password: "" }); await load(); setMsg("Mot de passe supprimé."); })}>Supprimer</button>}
        </div>
      </section>
      {me.history.length > 0 && (
        <section className="au-section">
          <h2>Historique</h2>
          <table className="au-table"><tbody>{me.history.map((h) => <tr key={h.id}><td>{new Date(h.createdAt).toLocaleDateString("fr-FR")}</td><td>{h.planId}</td><td>{h.status}</td><td>{h.simulated ? "simulation" : h.provider}</td><td>{h.reference}</td></tr>)}</tbody></table>
        </section>
      )}
      {msg && <p className="au-ok">{msg}</p>}
      {error && <p className="au-error">{error}</p>}
      <p className="au-foot"><a href="/deconnexion">Se déconnecter</a></p>
    </AuthShell>
  );
}

export function DemoOutbox() {
  const [emails, setEmails] = useState<{ id: string; to: string; subject: string; body: string; createdAt: string }[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch("/api/auth/outbox", { cache: "no-store" }).then(async (r) => (r.ok ? setEmails((await r.json()).emails) : setError("Disponible uniquement en mode simulation (MAIL_MODE=simulation).")));
  }, []);
  const linkify = (text: string) => text.split(/(https?:\/\/\S+)/g).map((part, i) => (/^https?:\/\//.test(part) ? <a key={i} href={part}>{part}</a> : part));
  return (
    <AuthShell title="Boîte d'envoi de démo" subtitle="Emails système simulés (codes de connexion, liens magiques). Aucun email réel n'est envoyé.">
      {error && <p className="au-error">{error}</p>}
      {emails?.length === 0 && <p className="au-muted">Aucun email pour l&apos;instant.</p>}
      {emails?.map((e) => (
        <article key={e.id} className="au-mail">
          <header><strong>{e.subject}</strong><span>{e.to} · {new Date(e.createdAt).toLocaleString("fr-FR", { timeZone: "Africa/Douala" })}</span></header>
          <pre>{linkify(e.body)}</pre>
        </article>
      ))}
    </AuthShell>
  );
}
