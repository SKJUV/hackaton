"use client";

import {
  Globe2,
  Package,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Zap,
} from "lucide-react";

export const quickActionPrompts = [
  {
    id: "fai",
    label: "Créer un FAI / Fournir Internet",
    icon: Globe2,
    prompt: "Je veux créer une entreprise qui fournit Internet au public au Cameroun. Quelles démarches dois-je suivre ?",
    tint: "cyan",
  },
  {
    id: "facture",
    label: "Litige Facture & Recours",
    icon: ShieldAlert,
    prompt: "Quels sont mes droits si un opérateur me facture un service non demandé ou si ma ligne est coupée ?",
    tint: "rose",
  },
  {
    id: "cyber",
    label: "Cybersécurité & Données",
    icon: ShieldCheck,
    prompt: "Que dit la loi camerounaise sur la cybercriminalité, le piratage et la protection des données personnelles ?",
    tint: "violet",
  },
  {
    id: "sim",
    label: "Vente de Cartes SIM",
    icon: Smartphone,
    prompt: "Je veux vendre des cartes SIM et forfaits. Quelles sont mes obligations d'identification des abonnés ?",
    tint: "emerald",
  },
  {
    id: "ecommerce",
    label: "Boutique en ligne",
    icon: ShoppingBag,
    prompt: "Explique-moi les règles obligatoires du commerce électronique et des contrats en ligne au Cameroun.",
    tint: "amber",
  },
  {
    id: "colis",
    label: "Livraison & Colis",
    icon: Package,
    prompt: "Je veux créer une entreprise de livraison de colis au Cameroun. Quelles autorisations postales dois-je obtenir ?",
    tint: "indigo",
  },
];

export function QuickActionChips({
  onSelectPrompt,
  loading,
}: {
  onSelectPrompt: (prompt: string) => void;
  loading?: boolean;
}) {
  return (
    <div className="quick-actions-bar">
      <div className="quick-actions-label">
        <Zap size={14} /> Actions rapides :
      </div>
      <div className="quick-actions-scroll">
        {quickActionPrompts.map((chip) => {
          const Icon = chip.icon;
          return (
            <button
              key={chip.id}
              className={`quick-chip-btn chip-${chip.tint}`}
              type="button"
              disabled={loading}
              onClick={() => onSelectPrompt(chip.prompt)}
            >
              <Icon size={14} className="chip-icon" />
              <span>{chip.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
