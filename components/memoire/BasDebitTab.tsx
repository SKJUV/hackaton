"use client";

import { Feather } from "lucide-react";
import { useEffect, useState } from "react";
import type { TabProps } from "@/components/workspace/Tabs";
import { Card } from "@/components/workspace/ui";
import { LiteConsole } from "./LiteConsole";
import { LITE_KEY, setLiteMode } from "./LiteModeBoot";
import "./memoire.css";

/** Onglet « Bas débit & vocal ». */
export function BasDebitTab({ snap }: TabProps) {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(localStorage.getItem(LITE_KEY) === "1"), []);
  return (
    <div className="mem">
      <Card title={<><Feather size={16} /> Mode bas débit et vocal</>}>
        <p>Pour les connexions lentes ou coûteuses : pas d&apos;images ni d&apos;animations, réponses courtes, dictée vocale, lecture vocale des réponses, et questions mises en file hors ligne (PWA).</p>
        <div className="mem-row">
          <label className="mem-toggle"><input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); setLiteMode(e.target.checked); }} /> Interface allégée dans tout le workspace</label>
          <a className="ws-btn ws-btn-primary" href="/workspace/memoire/bas-debit">Ouvrir la version ultra-légère</a>
        </div>
        <p className="ws-muted">La version ultra-légère est une page autonome (quelques Ko, sans le tableau de bord) mise en cache par l&apos;application installée : elle s&apos;ouvre hors connexion.</p>
      </Card>
      <Card title="Console vocale"><LiteConsole companyId={snap.company.id} /></Card>
    </div>
  );
}
