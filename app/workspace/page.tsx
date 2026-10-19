"use client";

import {
  Activity,
  Bot,
  Building2,
  CalendarCheck,
  ClipboardList,
  FileText,
  Gavel,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Plus,
  Radar,
  RotateCcw,
  Scale,
  Sparkles,
  ShieldCheck,
  Truck,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AgentPanel } from "@/components/workspace/AgentPanel";
import {
  Approvals,
  Checklist,
  Compliance,
  Dashboard,
  Documents,
  Journal,
  Legal,
  Outbox,
  Suppliers,
  Tasks,
  Team,
  Watch,
  type TabProps,
} from "@/components/workspace/Tabs";
import { api, Badge } from "@/components/workspace/ui";
import { Paywall } from "@/components/workspace/Paywall";
import { StudioTab } from "@/components/studio/StudioTab";
import { LEVELS, NAV } from "@/components/workspace/module-catalog";
import { MODULE_SLOTS } from "@/components/workspace/module-slots";
import { ModulePlaceholder } from "@/components/workspace/ModulePlaceholder";
import { getMe, type Me } from "@/components/auth/client";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import type { Snapshot } from "@/lib/workspace/service";

type TabId = string;

export default function WorkspacePage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [companyId, setCompanyId] = useState<string | undefined>();
  const [memberId, setMemberId] = useState("");
  const [tab, setTab] = useState<TabId>("tableau");
  const [toast, setToast] = useState<{ text: string; type: string } | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState("");
  const [me, setMe] = useState<Me | null>(null);

  const load = useCallback(async (id?: string) => {
    try {
      const data = await api<Snapshot>(`/api/workspace${id ? `?companyId=${id}` : ""}`);
      setSnap(data);
      setError("");
      const self = await getMe().catch(() => null);
      setMemberId((current) =>
        data.members.some((m) => m.id === current)
          ? current
          : data.members.find((m) => self?.user && m.email.toLowerCase() === self.user.email)?.id ?? data.members[0]?.id ?? "",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("ws-company") ?? undefined;
    setCompanyId(saved);
    void getMe().then((m) => {
      setMe(m);
      if (m.assistantAccess) void load(saved);
    });
    const t = localStorage.getItem("droit-cm-theme");
    if (t) document.documentElement.setAttribute("data-theme", t);
  }, [load]);

  // Onglet dans l'URL (#idea, #fund…) : lien direct vers un module.
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (id && NAV.some((n) => n.id === id)) setTab(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  function selectTab(id: string) {
    setTab(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  const refresh = useCallback(() => load(companyId), [load, companyId]);
  const notify = useCallback((text: string, type = "success") => {
    setToast({ text, type });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  function switchCompany(id: string) {
    setCompanyId(id);
    localStorage.setItem("ws-company", id);
    void load(id);
  }

  async function resetDemo() {
    if (!window.confirm("Réinitialiser le workspace avec les données de démonstration ? Toutes les modifications locales seront perdues.")) return;
    await api("/api/workspace/reset", "POST");
    localStorage.removeItem("ws-company");
    setCompanyId(undefined);
    await load();
    notify("Workspace de démonstration réinitialisé", "info");
  }

  if (me && !me.assistantAccess) return <Paywall me={me} />;
  if (error && !snap) return <div className="ws-loading">{error}</div>;
  if (!snap) return <div className="ws-loading">Chargement du workspace…</div>;

  const pendingCount = snap.approvals.filter((a) => a.status === "en_attente").length;
  const props: TabProps = { snap, memberId, refresh, notify, goTo: (t) => selectTab(t) };
  const current = NAV.find((t) => t.id === tab) ?? NAV[0];
  const Slot = current.kind === "module" ? MODULE_SLOTS[current.id] : undefined;

  return (
    <div className="ws-shell">
      <aside className="ws-sidebar">
        <a href="/" className="ws-brand"><Scale size={20} /> <span>Co-founder <em>Workspace</em></span></a>
        <label className="ws-label">Entreprise</label>
        <div className="ws-company-select">
          <Building2 size={15} />
          <select value={snap.company.id} onChange={(e) => switchCompany(e.target.value)}>
            {snap.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="ws-icon-btn" title="Nouvelle entreprise" onClick={() => setShowNew(true)}><Plus size={15} /></button>
        </div>
        <nav className="ws-nav" aria-label="Navigation du workspace par niveau">
          {LEVELS.map((level) => (
            <div key={level.id} className="ws-nav-group">
              <div className="ws-nav-level" title={level.hint}>{level.label}</div>
              {NAV.filter((n) => n.level === level.id).map(({ id, label, icon: Icon, kind }) => (
                <button key={id} className={`${tab === id ? "is-active" : ""} ${kind === "module" && !MODULE_SLOTS[id] ? "is-pending" : ""}`} onClick={() => selectTab(id)}>
                  <Icon size={16} /> <span>{label}</span>
                  {id === "approbations" && pendingCount > 0 && <b className="ws-count">{pendingCount}</b>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="ws-sidebar-foot">
          <label className="ws-label">Je suis</label>
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            {snap.members.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}
          </select>
          {me?.user && (
            <div className="ws-account">
              <span title={me.user.email}>{me.user.name}</span>
              <a href="/compte">Compte</a>
              <a href="/tarifs">Abonnement</a>
              <a href="/deconnexion">Déconnexion</a>
            </div>
          )}
          <div className="ws-foot-row">
            <ThemeToggle />
            <button className="ws-icon-btn" title="Réinitialiser la démo" onClick={() => void resetDemo()}><RotateCcw size={15} /></button>
          </div>
        </div>
      </aside>

      <main className="ws-main">
        <header className="ws-topbar">
          <div>
            <h1>{current.label}</h1>
            <p>{snap.company.name} · {snap.company.sector} · {snap.company.legalForm} · {snap.company.city} {snap.company.isExample && <Badge tone="amber">Données de démo</Badge>}</p>
          </div>
          <div className="ws-top-badges">
            <Badge tone={snap.mail.mode === "simulation" ? "violet" : "green"} title="MAIL_MODE">Emails : {snap.mail.mode === "simulation" ? "simulation" : `réel (${snap.mail.provider})`}</Badge>
            <Badge tone={snap.compliance.score >= 65 ? "green" : snap.compliance.score >= 40 ? "amber" : "rose"}>Conformité {snap.compliance.score}/100</Badge>
          </div>
        </header>
        <div className={`ws-content ${tab === "agent" ? "is-agent" : ""}`}>
          {tab === "tableau" && <Dashboard {...props} />}
          {tab === "agent" && <AgentPanel snap={snap} onChange={() => void refresh()} goTo={(t) => selectTab(t)} />}
          {tab === "studio" && <StudioTab />}
          {tab === "approbations" && <Approvals {...props} />}
          {tab === "envoi" && <Outbox {...props} />}
          {tab === "fournisseurs" && <Suppliers {...props} />}
          {tab === "demarches" && <Checklist {...props} />}
          {tab === "documents" && <Documents {...props} />}
          {tab === "juridique" && <Legal {...props} />}
          {tab === "conformite" && <Compliance {...props} />}
          {tab === "veille" && <Watch {...props} />}
          {tab === "taches" && <Tasks {...props} />}
          {tab === "equipe" && <Team {...props} />}
          {tab === "journal" && <Journal {...props} />}
          {current.kind === "module" && (Slot ? <Slot {...props} /> : <ModulePlaceholder entry={current} />)}
        </div>
      </main>

      {showNew && <NewCompany onClose={() => setShowNew(false)} onCreated={(id) => { setShowNew(false); switchCompany(id); notify("Workspace créé"); }} />}
      {toast && <div className={`ws-toast is-${toast.type}`}>{toast.text}</div>}
    </div>
  );
}

function NewCompany({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({ name: "", sector: "", legalForm: "SARL", city: "Douala", description: "", ownerName: "", keywords: "" });
  const [error, setError] = useState("");
  async function submit() {
    try {
      const co = await api<{ id: string }>("/api/workspace/companies", "POST", {
        ...form,
        sectorKeywords: form.keywords.split(",").map((k) => k.trim()).filter(Boolean),
      });
      onCreated(co.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="ws-modal-backdrop" onClick={onClose}>
      <div className="ws-modal" onClick={(e) => e.stopPropagation()}>
        <header><h3>Nouvelle entreprise</h3><button className="ws-icon-btn" onClick={onClose}><X size={16} /></button></header>
        <input placeholder="Nom de l'entreprise *" value={form.name} onChange={set("name")} />
        <input placeholder="Secteur d'activité * (ex. vente en ligne de cosmétiques)" value={form.sector} onChange={set("sector")} />
        <div className="ws-toolbar">
          <select value={form.legalForm} onChange={set("legalForm")}><option>SARL</option><option>SAS</option><option>SA</option><option>Entreprise individuelle</option><option>GIE</option></select>
          <input placeholder="Ville" value={form.city} onChange={set("city")} />
        </div>
        <input placeholder="Votre nom" value={form.ownerName} onChange={set("ownerName")} />
        <textarea placeholder="Description du projet" value={form.description} onChange={set("description")} rows={3} />
        <input placeholder="Mots-clés de veille (séparés par des virgules)" value={form.keywords} onChange={set("keywords")} />
        {error && <p className="ws-error">{error}</p>}
        <button className="ws-btn ws-btn-primary" onClick={() => void submit()}>Créer le workspace</button>
      </div>
    </div>
  );
}
