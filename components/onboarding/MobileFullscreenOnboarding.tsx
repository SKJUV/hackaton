"use client";

import { ArrowRight, BookOpen, FileText, Mic, Scale, ShieldCheck, Sparkles, X } from "lucide-react";
import { useState } from "react";

const tutorialSteps = [
  {
    stepNumber: "01",
    badge: "Bienvenue sur Droit.cm",
    badgeIcon: Scale,
    title: "Le droit camerounais, enfin limpide.",
    description:
      "Plus besoin de déchiffrer des pavés juridiques complexes. Posez vos questions du quotidien en mots simples et comprenez immédiatement vos droits.",
    illustration: Scale,
    highlight: "Comprendre ses droits en 1 minute",
    tint: "cyan",
  },
  {
    stepNumber: "02",
    badge: "Sources officielles vérifiées",
    badgeIcon: BookOpen,
    title: "100% appuyé sur les lois et décrets.",
    description:
      "Chaque réponse cite les articles exacts issus de 43 textes légaux (Lois, Décrets, Arrêtés, Régulation ART) avec accès direct aux documents officiels.",
    illustration: FileText,
    highlight: "Articles de loi cités et vérifiables",
    tint: "violet",
  },
  {
    stepNumber: "03",
    badge: "Interaction Texte & Voix",
    badgeIcon: Mic,
    title: "Parlez au micro ou tapez librement.",
    description:
      "Posez vos questions à la voix et écoutez les explications audio d'un simple clic. Tout est pensé pour aller vite, sans barrière.",
    illustration: Mic,
    highlight: "Assistant vocal & écrit instantané",
    tint: "emerald",
  },
];

export function MobileFullscreenOnboarding({ onComplete }: { onComplete: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = tutorialSteps[currentStep];
  const BadgeIcon = step.badgeIcon;

  function handleNext() {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      onComplete();
    }
  }

  return (
    <div className="mobile-tuto-fullscreen" role="dialog" aria-modal="true">
      <div className="mobile-tuto-header">
        <div className="mobile-tuto-progress">
          {tutorialSteps.map((_, idx) => (
            <span
              key={idx}
              className={`tuto-progress-bar ${
                idx === currentStep ? "active" : idx < currentStep ? "passed" : ""
              }`}
            />
          ))}
        </div>
        <button
          className="tuto-skip-btn"
          type="button"
          onClick={onComplete}
          aria-label="Passer le tutoriel"
        >
          Passer <X size={15} />
        </button>
      </div>

      <div className="mobile-tuto-content">
        <div className={`tuto-hero-badge ${step.tint}`}>
          <BadgeIcon size={16} />
          <span>{step.badge}</span>
        </div>

        <div className="tuto-illustration-wrap">
          <span className="tuto-big-emoji">
            <step.illustration size={52} strokeWidth={1.8} />
          </span>
          <div className={`tuto-ambient-halo ${step.tint}`} />
        </div>

        <div className="tuto-text-block">
          <h1 className="tuto-big-title">{step.title}</h1>
          <p className="tuto-big-desc">{step.description}</p>
        </div>

        <div className="tuto-highlight-card">
          <ShieldCheck size={18} className="tuto-card-icon" />
          <span>{step.highlight}</span>
        </div>
      </div>

      <div className="mobile-tuto-footer">
        <div className="tuto-step-counter">
          Étape <strong>{currentStep + 1}</strong> sur 3
        </div>

        <button
          className={`tuto-main-action-btn ${currentStep === 2 ? "finish-btn" : ""}`}
          type="button"
          onClick={handleNext}
        >
          {currentStep < 2 ? (
            <>
              Continuer <ArrowRight size={18} />
            </>
          ) : (
            <>
              C&apos;est parti ! <Sparkles size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
