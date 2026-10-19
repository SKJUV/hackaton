"use client";

import {
  Award,
  BookOpen,
  CheckCircle,
  HelpCircle,
  Info,
  Layers,
  Scale,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { PwaInstallPrompt } from "../ui/PwaInstallPrompt";
import { ThemeToggle } from "../ui/ThemeToggle";

interface UserProfileViewProps {
  onReopenTutorial: () => void;
  onGoToDiagnostic: () => void;
}

export function UserProfileView({
  onReopenTutorial,
  onGoToDiagnostic,
}: UserProfileViewProps) {
  return (
    <div className="profile-view-container">
      {/* Header Profile */}
      <div className="profile-header-card">
        <div className="profile-avatar-large">
          <Scale size={28} />
        </div>
        <div className="profile-info-content">
          <h2>Mon Espace Juridique</h2>
          <p>Plateforme Citoyenne & Professionnelle · Droit du Cameroun</p>
          <div className="profile-badge-row">
            <span className="badge-official">
              <ShieldCheck size={14} /> 43 Textes Officiels Indexés
            </span>
            <span className="badge-pwa">
              <Smartphone size={14} /> Application PWA Hors-Ligne
            </span>
          </div>
        </div>
      </div>

      {/* Quick Settings & Actions */}
      <div className="profile-grid">
        {/* Card 1: Apparence & Thème */}
        <div className="profile-card">
          <div className="profile-card-header">
            <Sparkles size={18} className="profile-card-icon cyan" />
            <div>
              <strong>Apparence de l&apos;interface</strong>
              <span>Basculer entre le mode clair et le mode sombre</span>
            </div>
          </div>
          <div className="profile-card-action">
            <ThemeToggle />
          </div>
        </div>

        {/* Card 2: Guide & Tutoriel */}
        <div className="profile-card">
          <div className="profile-card-header">
            <HelpCircle size={18} className="profile-card-icon amber" />
            <div>
              <strong>Guide d&apos;accueil</strong>
              <span>Revoir la présentation et les astuces d&apos;utilisation</span>
            </div>
          </div>
          <div className="profile-card-action">
            <button
              type="button"
              className="profile-btn-secondary"
              onClick={onReopenTutorial}
            >
              Revoir le guide
            </button>
          </div>
        </div>

        {/* Card 3: Installation Mobile PWA */}
        <div className="profile-card">
          <div className="profile-card-header">
            <Smartphone size={18} className="profile-card-icon emerald" />
            <div>
              <strong>Installer l&apos;application (PWA)</strong>
              <span>Accès direct depuis l&apos;écran d&apos;accueil et mode hors-ligne</span>
            </div>
          </div>
          <div className="profile-card-action">
            <PwaInstallPrompt />
          </div>
        </div>

        {/* Card 4: Diagnostic de conformité */}
        <div className="profile-card">
          <div className="profile-card-header">
            <Award size={18} className="profile-card-icon violet" />
            <div>
              <strong>Diagnostic Express de Conformité</strong>
              <span>Vérifier en 3 clics les autorisations nécessaires pour votre entreprise</span>
            </div>
          </div>
          <div className="profile-card-action">
            <button
              type="button"
              className="profile-btn-primary"
              onClick={onGoToDiagnostic}
            >
              Lancer le diagnostic
            </button>
          </div>
        </div>
      </div>

      {/* Legal Data Overview */}
      <div className="profile-legal-data-card">
        <div className="legal-data-header">
          <BookOpen size={20} />
          <div>
            <h3>Corpus Réglementaire Officiel du Cameroun</h3>
            <p>Données officielles intégrées dans le moteur RAG de Fama AI</p>
          </div>
        </div>

        <div className="legal-data-stats">
          <div className="stat-box">
            <span className="stat-number">43</span>
            <span className="stat-label">Lois & Décrets du Cameroun</span>
          </div>
          <div className="stat-box">
            <span className="stat-number">5</span>
            <span className="stat-label">Corpus Sectoriels Numériques</span>
          </div>
          <div className="stat-box">
            <span className="stat-number">100%</span>
            <span className="stat-label">Citations Légales Vérifiées</span>
          </div>
        </div>

        <div className="legal-disclaimer">
          <Info size={16} />
          <p>
            <strong>Note légale :</strong> Les informations fournies constituent une aide
            documentaire fondée sur les textes officiels de la République du Cameroun (MINPOSTEL,
            ART, ANTIC). Elles ne remplacent pas la consultation formelle d&apos;un avocat ou d&apos;un conseil juridique agréé.
          </p>
        </div>
      </div>
    </div>
  );
}
