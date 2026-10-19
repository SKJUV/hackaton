"use client";

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  CreditCard,
  FileCheck,
  Globe2,
  Laptop,
  Package,
  Radio,
  RotateCcw,
  Scale,
  Search,
  Shield,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react";
import { useState } from "react";

interface ComplianceDiagnosticViewProps {
  onAskAboutResult: (prompt: string) => void;
}

type Sector = "ecommerce" | "telecom" | "data" | "hardware" | "postale";
type Exploitation = "public" | "enterprise" | "internal";
type Technical = "payments" | "frequencies" | "basic";

interface DiagnosticResult {
  regime: string;
  badgeType: "warning" | "success" | "info";
  summary: string;
  laws: string[];
  steps: string[];
  recommendedPrompt: string;
}

export function ComplianceDiagnosticView({ onAskAboutResult }: ComplianceDiagnosticViewProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [sector, setSector] = useState<Sector | null>(null);
  const [exploitation, setExploitation] = useState<Exploitation | null>(null);
  const [technical, setTechnical] = useState<Technical | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  function handleSelectSector(s: Sector) {
    setSector(s);
    setStep(2);
  }

  function handleSelectExploitation(e: Exploitation) {
    setExploitation(e);
    setStep(3);
  }

  function handleSelectTechnical(t: Technical) {
    setTechnical(t);
    setStep(4);
  }

  function resetDiagnostic() {
    setSector(null);
    setExploitation(null);
    setTechnical(null);
    setStep(1);
  }

  function computeResult(): DiagnosticResult {
    if (sector === "telecom") {
      if (technical === "frequencies") {
        return {
          regime: "Licence d'Exploitation avec Assignation de Fréquences (ART)",
          badgeType: "warning",
          summary:
            "L'utilisation de fréquences hertziennes ou le déploiement de réseau ouvert au public relève d'une autorisation sectorielle stricte délivrée par l'ART et le MINPOSTEL.",
          laws: [
            "Loi n° 2010/013 du 21 décembre 2010 régissant les communications électroniques (Art. 12 à 25)",
            "Décret n° 2012/1640/PM fixant les conditions d'octroi des titres d'exploitation",
            "Décision ART fixant les redevances d'assignation des fréquences radioélectriques",
          ],
          steps: [
            "Constitution du dossier technique d'assignation de fréquences auprès de l'ART",
            "Paiement de la redevance annuelle de spectre et frais de dossier",
            "Homologation préalable de l'ensemble des émetteurs et antennes",
          ],
          recommendedPrompt:
            "Quelles sont les démarches et conditions pour obtenir une licence et des fréquences auprès de l'ART au Cameroun ?",
        };
      }
      return {
        regime: "Régime d'Autorisation ou Déclaration Préalable (FAI / Services Télécom)",
        badgeType: "info",
        summary:
          "Fournir un service Internet au public en utilisant l'infrastructure d'un opérateur concessionnaire existant relève du régime de licence ou déclaration préalable.",
        laws: [
          "Loi n° 2010/013 du 21 décembre 2010 (Art. 14 et 22)",
          "Décret d'application relatif aux régimes d'autorisation des services de communications",
        ],
        steps: [
          "Dépôt d'une déclaration préalable ou demande de titre auprès de l'ART",
          "Signature d'un accord d'interconnexion ou d'accès avec un opérateur de transport (Camtel, etc.)",
          "Mise en conformité du dispositif d'identification des abonnés (Décret 2015/3759/PM)",
        ],
        recommendedPrompt:
          "Je veux créer une entreprise fournissant Internet au public au Cameroun sans construire mon propre réseau. Quel régime s'applique ?",
      };
    }

    if (sector === "ecommerce") {
      return {
        regime: "Régime de Déclaration & Respect des Obligations du Commerce Électronique",
        badgeType: "success",
        summary:
          "Les plateformes de vente en ligne et marketplaces sont soumises à la réglementation camerounaise sur le commerce électronique, la protection du consommateur et la sécurité des données bancaires.",
        laws: [
          "Loi n° 2010/012 du 21 décembre 2010 relative à la cybersécurité et la cybercriminalité (Titre III sur le commerce électronique)",
          "Loi n° 2011/012 du 6 mai 2011 portant protection du consommateur au Cameroun",
          "Réglementation CEMAC relative aux systèmes et moyens de paiement électroniques",
        ],
        steps: [
          "Affichage obligatoire des mentions légales complètes et conditions générales de vente (CGV)",
          "Droit de rétractation de 7 jours minimum garanti aux consommateurs camerounais",
          "Mise en place d'un protocole sécurisé (SSL/TLS) pour toute transaction monétique",
        ],
        recommendedPrompt:
          "Quelles sont les obligations légales impératives pour lancer une boutique ou marketplace en ligne au Cameroun ?",
      };
    }

    if (sector === "data") {
      return {
        regime: "Régime de Déclaration de Traitement des Données Personnelles & Conformité Cyber",
        badgeType: "warning",
        summary:
          "Toute entreprise collectant, hébergeant ou traitant des données personnelles de citoyens camerounais doit garantir la confidentialité et la notification des failles.",
        laws: [
          "Loi n° 2010/012 du 21 décembre 2010 sur la cybersécurité (Protection de la vie privée)",
          "Textes de l'ANTIC relatifs aux audits de sécurité obligatoires des systèmes informatiques",
        ],
        steps: [
          "Recueil obligatoire du consentement préalable, libre et éclairé des utilisateurs",
          "Audit de sécurité périodique par un expert ou organisme agréé par l'ANTIC",
          "Notification obligatoire en cas d'intrusion ou de fuite de données aux autorités compétentes",
        ],
        recommendedPrompt:
          "Que dit la loi camerounaise sur les obligations d'une entreprise qui collecte et héberge des données personnelles ?",
      };
    }

    if (sector === "hardware") {
      return {
        regime: "Homologation Obligatoire des Équipements de Télécommunications (ART)",
        badgeType: "warning",
        summary:
          "L'importation, la commercialisation et l'installation d'équipements radioélectriques ou terminaux connectés au réseau exigent un certificat d'homologation préalable de l'ART.",
        laws: [
          "Loi n° 2010/013 (Art. 56 et suivants sur l'homologation des équipements)",
          "Décision ART fixant les spécifications techniques et les redevances d'homologation",
        ],
        steps: [
          "Demande de certificat d'homologation auprès de la Direction Générale de l'ART",
          "Soumission du dossier technique du fabricant (tests SAR, normes CEM)",
          "Agrément d'installateur radioélectrique si vous effectuez la pose pour des tiers",
        ],
        recommendedPrompt:
          "Quelles sont les démarches pour homologuer des équipements télécoms ou téléphones avant leur vente au Cameroun ?",
      };
    }

    // sector === "postale"
    return {
      regime: "Agrément / Licence d'Opérateur Postal et de Messagerie (MINPOSTEL)",
      badgeType: "info",
      summary:
        "L'activité de collecte, transport et distribution de plis, colis ou livraisons urbaines est une activité réglementée soumise à titre d'exploitation postal.",
      laws: [
        "Loi n° 2020/003 régissant l'activité postale au Cameroun",
        "Décret d'application fixant les catégories d'agrément des opérateurs privés de messagerie",
      ],
      steps: [
        "Demande d'agrément de catégorie C (messagerie urbaine et périurbaine) au MINPOSTEL",
        "Paiement des droits fixes et contribution au service postal universel",
        "Délivrance de l'attestation officielle avant démarrage effectif des livraisons",
      ],
      recommendedPrompt:
        "Je veux lancer une entreprise de livraison de colis au Cameroun. Quelles autorisations postales dois-je obtenir ?",
    };
  }

  const result = step === 4 ? computeResult() : null;

  // 43 Legal texts quick directory
  const legalDirectory = [
    {
      title: "Loi n° 2010/013 du 21 décembre 2010",
      subject: "Communications électroniques, FAI, réseaux ouverts, régulation ART",
      category: "Loi principale",
    },
    {
      title: "Loi n° 2010/012 du 21 décembre 2010",
      subject: "Cybersécurité, cybercriminalité, signature & commerce électronique",
      category: "Cybersécurité",
    },
    {
      title: "Loi n° 2011/012 du 6 mai 2011",
      subject: "Protection du consommateur, litiges facturation, garanties légales",
      category: "Consommation",
    },
    {
      title: "Décret n° 2012/1640/PM",
      subject: "Conditions d'interconnexion, accès aux infrastructures et partage",
      category: "Décret",
    },
    {
      title: "Décret n° 2015/3759/PM",
      subject: "Identification obligatoire des abonnés et des terminaux mobiles",
      category: "Sécurité",
    },
    {
      title: "Décision ART n° 00000021",
      subject: "Homologation des équipements et terminaux de télécommunications",
      category: "Régulation ART",
    },
  ].filter(
    (item) =>
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.subject.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="diagnostic-immersive-view">
      {/* Animated ambient backdrop */}
      <div className="diagnostic-ambient-glow" />

      <div className="diagnostic-container">
        {/* Header with Title and Stepper */}
        <div className="diagnostic-header">
          <div className="diagnostic-badge">
            <Scale size={14} />
            <span>Diagnostic Juridique Express · Cameroun</span>
          </div>
          <h2>Conformité Réglementaire</h2>
          <p>
            Sélectionnez vos critères pour obtenir instantanément le régime légal, les licences
            et les lois applicables à votre activité au Cameroun.
          </p>

          {/* Dynamic Progress Indicator */}
          <div className="diagnostic-progress-bar-wrap">
            <div className="progress-info-row">
              <span className="progress-step-text">
                {step === 4
                  ? "Diagnostic terminé"
                  : `Question ${step} sur 3`}
              </span>
              <span className="progress-percent-text">
                {step === 1 ? "33%" : step === 2 ? "66%" : step === 3 ? "90%" : "100%"}
              </span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width:
                    step === 1
                      ? "33%"
                      : step === 2
                      ? "66%"
                      : step === 3
                      ? "90%"
                      : "100%",
                }}
              />
            </div>
          </div>
        </div>

        {/* Question 1 : Visible ONLY when step === 1 */}
        {step === 1 && (
          <div className="diag-step-card" key="step-1">
            <div className="step-card-header">
              <span className="step-number-pill">Étape 1</span>
              <h3>Quel est le secteur d&apos;activité de votre projet ?</h3>
              <p>Choisissez le domaine principal d&apos;exercice :</p>
            </div>

            <div className="step-options-grid">
              <button
                type="button"
                className="diag-option-btn"
                onClick={() => handleSelectSector("ecommerce")}
              >
                <div className="option-icon cyan">
                  <ShoppingBag size={22} strokeWidth={2} />
                </div>
                <div className="option-text">
                  <strong>Commerce en ligne & Marketplace</strong>
                  <span>Vente de produits, réservation, contrats & transactions numériques</span>
                </div>
                <ArrowRight size={18} className="option-arrow" />
              </button>

              <button
                type="button"
                className="diag-option-btn"
                onClick={() => handleSelectSector("telecom")}
              >
                <div className="option-icon emerald">
                  <Globe2 size={22} strokeWidth={2} />
                </div>
                <div className="option-text">
                  <strong>Services Internet & Télécom (FAI)</strong>
                  <span>Fourniture d&apos;accès Internet, Wi-Fi public, VSAT, téléphonie VoIP</span>
                </div>
                <ArrowRight size={18} className="option-arrow" />
              </button>

              <button
                type="button"
                className="diag-option-btn"
                onClick={() => handleSelectSector("data")}
              >
                <div className="option-icon violet">
                  <ShieldCheck size={22} strokeWidth={2} />
                </div>
                <div className="option-text">
                  <strong>Données Personnelles & Cybersécurité</strong>
                  <span>Hébergement cloud, traitement de données d&apos;utilisateurs, audits de sécurité</span>
                </div>
                <ArrowRight size={18} className="option-arrow" />
              </button>

              <button
                type="button"
                className="diag-option-btn"
                onClick={() => handleSelectSector("hardware")}
              >
                <div className="option-icon amber">
                  <Smartphone size={22} strokeWidth={2} />
                </div>
                <div className="option-text">
                  <strong>Équipements & Terminaux Radioélectriques</strong>
                  <span>Importation et commercialisation de téléphones, antennes, émetteurs</span>
                </div>
                <ArrowRight size={18} className="option-arrow" />
              </button>

              <button
                type="button"
                className="diag-option-btn"
                onClick={() => handleSelectSector("postale")}
              >
                <div className="option-icon rose">
                  <Package size={22} strokeWidth={2} />
                </div>
                <div className="option-text">
                  <strong>Colis, Livraison Urbaine & Messagerie</strong>
                  <span>Transport et distribution de plis, colis express, coursiers à moto</span>
                </div>
                <ArrowRight size={18} className="option-arrow" />
              </button>
            </div>
          </div>
        )}

        {/* Question 2 : Visible ONLY when step === 2 */}
        {step === 2 && (
          <div className="diag-step-card" key="step-2">
            <div className="step-card-header">
              <button type="button" className="diag-back-btn" onClick={() => setStep(1)}>
                <ArrowLeft size={15} /> Modifier le secteur
              </button>
              <span className="step-number-pill">Étape 2</span>
              <h3>À quel public votre service s&apos;adresse-t-il ?</h3>
              <p>Le régime d&apos;autorisation varie selon l&apos;ouverture au public :</p>
            </div>

            <div className="step-options-grid">
              <button
                type="button"
                className="diag-option-btn"
                onClick={() => handleSelectExploitation("public")}
              >
                <div className="option-icon cyan">
                  <Users size={22} strokeWidth={2} />
                </div>
                <div className="option-text">
                  <strong>Grand Public & Consommateurs (B2C)</strong>
                  <span>Offre accessible à tous les citoyens et clients particuliers</span>
                </div>
                <ArrowRight size={18} className="option-arrow" />
              </button>

              <button
                type="button"
                className="diag-option-btn"
                onClick={() => handleSelectExploitation("enterprise")}
              >
                <div className="option-icon emerald">
                  <Building2 size={22} strokeWidth={2} />
                </div>
                <div className="option-text">
                  <strong>Professionnels & Entreprises (B2B)</strong>
                  <span>Prestations et contrats dédiés aux entreprises et personnes morales</span>
                </div>
                <ArrowRight size={18} className="option-arrow" />
              </button>

              <button
                type="button"
                className="diag-option-btn"
                onClick={() => handleSelectExploitation("internal")}
              >
                <div className="option-icon violet">
                  <Shield size={22} strokeWidth={2} />
                </div>
                <div className="option-text">
                  <strong>Réseau ou Usage Strictement Interne</strong>
                  <span>Infrastructure fermée, réservée exclusivement au personnel de votre société</span>
                </div>
                <ArrowRight size={18} className="option-arrow" />
              </button>
            </div>
          </div>
        )}

        {/* Question 3 : Visible ONLY when step === 3 */}
        {step === 3 && (
          <div className="diag-step-card" key="step-3">
            <div className="step-card-header">
              <button type="button" className="diag-back-btn" onClick={() => setStep(2)}>
                <ArrowLeft size={15} /> Modifier le mode d&apos;exploitation
              </button>
              <span className="step-number-pill">Étape 3</span>
              <h3>Quelles sont les spécificités techniques et financières ?</h3>
              <p>Indiquez si votre solution intègre l&apos;un de ces aspects :</p>
            </div>

            <div className="step-options-grid">
              <button
                type="button"
                className="diag-option-btn"
                onClick={() => handleSelectTechnical("payments")}
              >
                <div className="option-icon amber">
                  <CreditCard size={22} strokeWidth={2} />
                </div>
                <div className="option-text">
                  <strong>Paiements Mobile Money / Cartes & Données Bancaires</strong>
                  <span>Encaissement en ligne, gestion de portefeuilles ou données financières</span>
                </div>
                <ArrowRight size={18} className="option-arrow" />
              </button>

              <button
                type="button"
                className="diag-option-btn"
                onClick={() => handleSelectTechnical("frequencies")}
              >
                <div className="option-icon violet">
                  <Radio size={22} strokeWidth={2} />
                </div>
                <div className="option-text">
                  <strong>Émetteurs Radio, Fréquences Hertziennes ou Antennes</strong>
                  <span>Utilisation d&apos;ondes radio, relais hertziens ou fréquences assignées</span>
                </div>
                <ArrowRight size={18} className="option-arrow" />
              </button>

              <button
                type="button"
                className="diag-option-btn"
                onClick={() => handleSelectTechnical("basic")}
              >
                <div className="option-icon emerald">
                  <Laptop size={22} strokeWidth={2} />
                </div>
                <div className="option-text">
                  <strong>Application Web ou Logiciel Standard sans Fréquences</strong>
                  <span>Plateforme cloud classique ne nécessitant aucun spectre radio dédié</span>
                </div>
                <ArrowRight size={18} className="option-arrow" />
              </button>
            </div>
          </div>
        )}

        {/* Result : Visible ONLY when step === 4 */}
        {step === 4 && result && (
          <div className="diagnostic-result-card" key="result-card">
            <div className="result-header">
              <div className={`result-tag ${result.badgeType}`}>
                <CheckCircle2 size={16} />
                <span>Diagnostic Établi</span>
              </div>
              <button type="button" className="restart-btn" onClick={resetDiagnostic}>
                <RotateCcw size={14} /> Refaire un diagnostic
              </button>
            </div>

            <h3 className="result-regime-title">{result.regime}</h3>
            <p className="result-summary">{result.summary}</p>

            {/* Textes légaux applicables */}
            <div className="result-section">
              <div className="result-section-title">
                <BookOpen size={16} />
                <strong>Textes de lois camerounais applicables :</strong>
              </div>
              <ul className="result-law-list">
                {result.laws.map((law, idx) => (
                  <li key={idx}>
                    <FileCheck size={14} />
                    <span>{law}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Démarches obligatoires */}
            <div className="result-section">
              <div className="result-section-title">
                <ShieldCheck size={16} />
                <strong>Checklist des démarches administratives :</strong>
              </div>
              <ol className="result-steps-list">
                {result.steps.map((st, idx) => (
                  <li key={idx}>{st}</li>
                ))}
              </ol>
            </div>

            {/* CTA: Ask AI */}
            <div className="result-action-box">
              <div>
                <strong>Obtenir l&apos;assistance complète de l&apos;IA</strong>
                <p>L&apos;assistant analyse vos 43 textes légaux pour détailler la constitution du dossier.</p>
              </div>
              <button
                type="button"
                className="ask-ai-cta-btn"
                onClick={() => onAskAboutResult(result.recommendedPrompt)}
              >
                <Sparkles size={16} />
                <span>Consulter l&apos;IA sur ce résultat</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Quick Search Directory of Cameroon's 43 Laws */}
        <div className="legal-quick-search-box">
          <div className="search-box-header">
            <div className="search-title-row">
              <Search size={18} />
              <h3>Répertoire Rapide des Textes Officiels du Cameroun</h3>
            </div>
            <span className="search-count-badge">43 textes indexés</span>
          </div>
          <p className="search-box-desc">
            Recherchez directement une loi, un décret ou une décision de l&apos;ART par mot-clé :
          </p>
          <div className="search-input-wrap">
            <Search size={16} className="search-icon-inside" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Ex: FAI, cybersécurité, licence, consommateur, homologation…"
              aria-label="Recherche rapide de texte"
            />
          </div>

          <div className="legal-directory-grid">
            {legalDirectory.map((item, idx) => (
              <div
                key={idx}
                className="legal-dir-card"
                role="button"
                tabIndex={0}
                onClick={() =>
                  onAskAboutResult(
                    `Explique-moi les points essentiels et les obligations prévues par : ${item.title} concernant : ${item.subject}`,
                  )
                }
              >
                <div className="dir-card-top">
                  <span className="dir-tag">{item.category}</span>
                  <span className="dir-ask-hint">
                    <Sparkles size={13} /> Expliquer
                  </span>
                </div>
                <strong>{item.title}</strong>
                <small>{item.subject}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
