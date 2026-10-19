"use client";

import "./entrepreneur.css";
import { useCallback, useEffect, useState } from "react";
import type { TabProps } from "@/components/workspace/Tabs";
import { api } from "@/components/workspace/ui";
import type { EntrepreneurSnapshot } from "@/lib/modules/entrepreneur/tools";
import { FundingPanel } from "./FundingPanel";
import { IdeaPanel } from "./IdeaPanel";
import { MarketPanel } from "./MarketPanel";
import { MentorsPanel } from "./MentorsPanel";
import { callAction, type ActionResult, type PanelProps } from "./shared";
import { TeamPanel } from "./TeamPanel";

export type Section = "idee" | "financement" | "equipe" | "mentors" | "marche";

const INTRO: Record<Section, string> = {
  idee: "Diagnostic honnête : aucune validation automatique. Les obstacles réglementaires sont cités article par article depuis le corpus officiel, sinon « non couvert ».",
  financement: "Programmes réels vérifiés (source + date) et programmes d'exemple clairement marqués. Les relances passent par l'onglet Approbations.",
  equipe: "Compétences manquantes, fiches de poste, filtrage objectif et anonymisé des candidatures, analyse collaborative et alerte de biais affinitaire.",
  mentors: "Profils de mentors d'EXEMPLE (aucun partenariat réel à ce jour). Les demandes de mise en relation passent par l'onglet Approbations.",
  marche: "Place de marché B2B construite sur l'annuaire fournisseurs (données d'exemple). Les demandes de devis passent par l'onglet Approbations.",
};

/** Coque commune des onglets du niveau Entrepreneur (idea, fund, team, mentor, market) : charge l'état du module et l'action. */
export function EntrepreneurShell({ section, ...props }: TabProps & { section: Section }) {
  const companyId = props.snap.company.id;
  const [ent, setEnt] = useState<EntrepreneurSnapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      setEnt(await api<EntrepreneurSnapshot>(`/api/entrepreneur?companyId=${encodeURIComponent(companyId)}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    }
  }, [companyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const act = useCallback(
    async <T,>(name: string, body: Record<string, unknown> = {}, success?: string): Promise<ActionResult<T> | null> => {
      setBusy(name);
      try {
        const r = await callAction<T>(companyId, name, body);
        await Promise.all([reload(), props.refresh()]);
        props.notify(success ?? r.summary, "success");
        return r;
      } catch (e) {
        props.notify(e instanceof Error ? e.message : "Erreur", "error");
        return null;
      } finally {
        setBusy(null);
      }
    },
    [companyId, reload, props],
  );

  if (error && !ent) return <div className="ws-info">{error}</div>;
  if (!ent) return <div className="ws-info">Chargement du module…</div>;
  const p: PanelProps = { ...props, ent, act, busy };
  return (
    <div className="ws-stack">
      <div className="ws-info">
        {INTRO[section]} Chaque analyse s&apos;appuie d&apos;abord sur le corpus officiel (document / article / page). Ces actions sont aussi disponibles dans le chat de l&apos;agent.
      </div>
      {section === "idee" && <IdeaPanel {...p} />}
      {section === "financement" && <FundingPanel {...p} />}
      {section === "equipe" && <TeamPanel {...p} />}
      {section === "mentors" && <MentorsPanel {...p} />}
      {section === "marche" && <MarketPanel {...p} />}
    </div>
  );
}
