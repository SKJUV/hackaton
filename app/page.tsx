"use client";

import {
  ArrowLeft,
  ArrowUp,
  BookOpen,
  ChevronDown,
  ExternalLink,
  FileText,
  Gavel,
  Globe2,
  HelpCircle,
  Menu,
  Plus,
  Scale,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState, type ReactNode } from "react";

// Modular UI Components
import { ArticleDrawer, type DrawerData } from "../components/ui/ArticleDrawer";
import { ThemeToggle } from "../components/ui/ThemeToggle";
import { Toast, type ToastMessage } from "../components/ui/Toast";

// Motion & Onboarding Components
import { MobileFullscreenOnboarding } from "../components/onboarding/MobileFullscreenOnboarding";
import { SplashScreen } from "../components/onboarding/SplashScreen";

// Home & Voice Components
import { QuickActionChips } from "../components/home/QuickActionChips";
import { TopicCardsGrid } from "../components/home/TopicCardsGrid";
import { VoiceInputButton } from "../components/voice/VoiceInputButton";

// Chat Components
import { MessageActions } from "../components/chat/MessageActions";

/* ===== TYPES ===== */
type Citation = {
  id: string;
  title: string;
  category: string;
  page: number;
  excerpt: string;
  file: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
};

/* ===== SIDEBAR TOPICS ===== */
const topics = [
  { label: "Droits du consommateur", icon: ShieldCheck },
  { label: "Télécommunications & FAI", icon: Globe2 },
  { label: "Cybersécurité & Données", icon: ShieldCheck },
  { label: "Commerce électronique", icon: BookOpen },
  { label: "Concurrence & Marché", icon: Gavel },
];

/* ===== 50 BUSINESS QUESTIONS ===== */
const businessQuestionCategories = [
  {
    title: "Télécommunications et Internet",
    icon: Globe2,
    questions: [
      "Je veux créer une entreprise qui fournit Internet au public au Cameroun. Quelles démarches dois-je suivre ?",
      "Je veux lancer un opérateur de téléphonie mobile. Quelles autorisations et quelles étapes dois-je prévoir ?",
      "Je veux créer un opérateur mobile virtuel sans construire mon propre réseau. Comment puis-je procéder ?",
      "Je veux déployer un réseau Internet dans une zone rurale. Quel régime d'autorisation pourrait s'appliquer ?",
      "Je veux construire un réseau de fibre optique pour fournir Internet. Quels titres d'exploitation dois-je vérifier ?",
      "Je veux fournir des services de télécommunications en utilisant le réseau d'un autre opérateur. Quel régime pourrait s'appliquer ?",
      "Je veux obtenir une concession pour exploiter un réseau télécom national. Quelles conditions et étapes les textes prévoient-ils ?",
      "Je veux exploiter un réseau de communications électroniques ouvert au public. Comment savoir si une concession ou une licence est nécessaire ?",
    ],
  },
  {
    title: "Installation et équipements",
    icon: Globe2,
    questions: [
      "Je veux créer une entreprise qui installe des antennes et des équipements télécom. Quel agrément dois-je obtenir ?",
      "Je veux importer des téléphones pour les vendre au Cameroun. Que dois-je vérifier avant leur commercialisation ?",
      "Je veux créer un laboratoire qui teste des équipements télécom. Quel agrément faut-il demander ?",
      "Je veux vendre des équipements de communications électroniques. Quel agrément ou quelle homologation faut-il prévoir ?",
      "Je veux importer des appareils radioélectriques. Quelles vérifications réglementaires dois-je faire avant de les vendre ?",
      "Je veux faire homologuer un nouveau modèle de téléphone avant sa commercialisation. Quelles règles s'appliquent ?",
      "Je veux installer et maintenir des infrastructures de communications électroniques pour des clients. Quels agréments dois-je vérifier ?",
    ],
  },
  {
    title: "Fréquences et services radio",
    icon: Globe2,
    questions: [
      "Je veux créer une entreprise de services radio utilisant ses propres fréquences. Quelles démarches dois-je entreprendre ?",
      "Je veux utiliser temporairement des fréquences pour couvrir un festival. Comment puis-je en faire la demande ?",
      "Je veux lancer un service qui utilise des fréquences disponibles au Cameroun. Dans quels cas un appel à concurrence peut-il être nécessaire ?",
      "Je veux exploiter une station radioélectrique pour mon entreprise. Quel accord préalable dois-je obtenir ?",
      "Je veux utiliser une fréquence radio pour un événement ponctuel. Quels éléments faut-il vérifier dans les règles d'assignation ?",
      "Je veux demander des fréquences pour un nouveau service télécom. Comment la disponibilité des fréquences peut-elle influencer la procédure ?",
      "Je veux exploiter plusieurs équipements radioélectriques sur différents sites. Quelles autorisations de fréquence dois-je vérifier ?",
    ],
  },
  {
    title: "Services numériques et commerce en ligne",
    icon: BookOpen,
    questions: [
      "Je veux créer une boutique en ligne au Cameroun. Quelles obligations les textes prévoient-ils envers mes clients ?",
      "Je veux lancer une plateforme qui fait signer des contrats à distance. Quelles règles sur la signature électronique dois-je vérifier ?",
      "Je veux créer une entreprise qui collecte les données de ses clients en ligne. Quelles précautions dois-je prendre ?",
      "Je veux vendre des produits sur Internet. Quelles informations dois-je communiquer au client avant sa commande ?",
      "Je veux lancer une plateforme de vente en ligne. Quelles règles encadrent la commande et sa confirmation ?",
      "Je veux proposer un service de certification de signatures électroniques. Quels textes du corpus dois-je consulter ?",
      "Je veux développer un service numérique qui traite des données personnelles. Quelles obligations de confidentialité dois-je vérifier ?",
    ],
  },
  {
    title: "Services postaux, livraison et colis",
    icon: BookOpen,
    questions: [
      "Je veux créer une entreprise de livraison de colis au Cameroun. Quelles démarches du secteur postal dois-je suivre ?",
      "Je veux lancer un service de courrier express entre plusieurs villes. Quel régime postal pourrait s'appliquer ?",
      "Je veux créer un réseau de points relais pour les colis. Quelles règles postales dois-je vérifier ?",
      "Je veux proposer la collecte, le tri et la distribution de colis. Une licence postale est-elle prévue par les textes ?",
      "Je veux lancer un service de courrier accéléré. Quelles obligations sectorielles dois-je vérifier ?",
      "Je veux créer une entreprise de transfert postal de fonds. Quelles règles spécifiques sont mentionnées dans les textes ?",
      "Je veux fournir un service postal non réservé. Que prévoient les articles 34 à 38 sur la licence ?",
    ],
  },
  {
    title: "Télécoms et obligations envers les clients",
    icon: ShieldCheck,
    questions: [
      "Je veux créer un opérateur Internet et utiliser les infrastructures d'un opérateur déjà établi. Comment demander l'accès ou l'interconnexion ?",
      "Je veux lancer une entreprise de télécommunications avec des forfaits prépayés. Quelles obligations d'identification des abonnés dois-je prévoir ?",
      "Je veux lancer un service mobile qui fonctionne aussi sur le réseau d'autres opérateurs. Quelles règles d'itinérance nationale vérifier ?",
      "Je veux vendre des cartes SIM dans des points de vente partenaires. Quelles obligations d'identification des abonnés dois-je respecter ?",
      "Je veux proposer des forfaits téléphoniques au public. Quelles règles encadrent l'information des abonnés et les tarifs ?",
      "Je veux créer un service de télécommunications et traiter les réclamations de mes abonnés. Quels textes du corpus peuvent s'appliquer ?",
      "Je veux partager des infrastructures avec un opérateur télécom existant. Quelles règles d'accès et de partage dois-je vérifier ?",
    ],
  },
  {
    title: "Idées de business dans un secteur réglementé",
    icon: Gavel,
    questions: [
      "Je veux créer une entreprise de services numériques sans exercer une activité réservée à un opérateur autorisé. Comment vérifier le régime applicable ?",
      "Je veux lancer un nouveau service qui combine Internet, téléphonie et vente d'équipements. Quelles autorisations pourraient concerner chaque activité ?",
      "Je veux développer une jeune entreprise dans le secteur des postes ou des télécommunications. Quels textes du corpus dois-je consulter en priorité ?",
      "Je veux lancer une activité télécom sans construire mon propre réseau. Comment déterminer si une licence, une concession ou une déclaration est nécessaire ?",
      "Je veux créer une entreprise qui fournit un service au public sur un réseau de communications électroniques. Quel régime d'exploitation vérifier ?",
      "Je veux créer une entreprise dans le secteur postal. Comment savoir si mon activité relève d'une licence ou d'une concession ?",
      "Je veux développer une activité réglementée dans les TIC. Comment distinguer les autorisations sectorielles des formalités générales de création d'entreprise ?",
    ],
  },
].flatMap((category) =>
  category.questions.map((prompt) => ({
    category: category.title,
    icon: category.icon,
    prompt,
  })),
);

/* ===== INLINE MARKDOWN PARSER ===== */
function renderInline(
  text: string,
  citations?: Citation[],
  onOpenCitation?: (citation: Citation) => void,
): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[S\d+\])/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    const citationMatch = part.match(/^\[S(\d+)\]$/);
    if (citationMatch) {
      const citIndex = parseInt(citationMatch[1], 10) - 1;
      const matchedCitation = citations && citations[citIndex];
      return (
        <span
          className="source-marker"
          key={index}
          role="button"
          tabIndex={0}
          title={matchedCitation ? `Consulter ${matchedCitation.title} (Page ${matchedCitation.page})` : "Consulter la source"}
          onClick={() => {
            if (matchedCitation && onOpenCitation) {
              onOpenCitation(matchedCitation);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matchedCitation && onOpenCitation) {
              onOpenCitation(matchedCitation);
            }
          }}
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

function formatAnswer(
  text: string,
  citations?: Citation[],
  onOpenCitation?: (citation: Citation) => void,
): ReactNode[] {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push(<h3 key={index}>{renderInline(heading[2], citations, onOpenCitation)}</h3>);
      index += 1;
      continue;
    }

    const listItem = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (listItem) {
      const ordered = /^\d+[.)]/.test(line);
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const match = lines[index].trim().match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
        if (!match || /^\d+[.)]/.test(lines[index].trim()) !== ordered) break;
        items.push(<li key={index}>{renderInline(match[1], citations, onOpenCitation)}</li>);
        index += 1;
      }
      blocks.push(ordered ? <ol key={`list-${index}`}>{items}</ol> : <ul key={`list-${index}`}>{items}</ul>);
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim()) {
      const nextLine = lines[index].trim();
      if (/^(#{1,3})\s+/.test(nextLine) || /^(?:[-*•]|\d+[.)])\s+/.test(nextLine)) break;
      paragraph.push(nextLine);
      index += 1;
    }
    blocks.push(<p key={index}>{renderInline(paragraph.join(" "), citations, onOpenCitation)}</p>);
  }

  return blocks;
}

export default function Home() {
  const [showSplash, setShowSplash] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);
  const [showQuestionLibrary, setShowQuestionLibrary] = useState(false);
  const [questionSearch, setQuestionSearch] = useState("");
  const [questionCategory, setQuestionCategory] = useState("Toutes les catégories");
  const [questionPage, setQuestionPage] = useState(0);

  // Drawer & Toast State
  const [selectedDrawerData, setSelectedDrawerData] = useState<DrawerData | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const filteredBusinessQuestions = businessQuestionCategories.filter(
    ({ prompt, category }) =>
      (questionCategory === "Toutes les catégories" || category === questionCategory) &&
      prompt.toLocaleLowerCase("fr").includes(questionSearch.trim().toLocaleLowerCase("fr")),
  );
  const questionsPerPage = 8;
  const visibleBusinessQuestions = filteredBusinessQuestions.slice(
    questionPage * questionsPerPage,
    (questionPage + 1) * questionsPerPage,
  );

  useEffect(() => {
    // Check onboarding status
    const seen = localStorage.getItem("droit-cm-onboarded");
    if (!seen) {
      setShowOnboarding(true);
    }
  }, []);

  function handleCompleteOnboarding() {
    setShowOnboarding(false);
    localStorage.setItem("droit-cm-onboarded", "1");
  }

  function reopenTutorial() {
    setShowOnboarding(true);
  }

  function showToastMessage(text: string, type: "success" | "info" | "error" = "success") {
    setToast({ id: String(Date.now()), text, type });
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [question]);

  function openArticleDrawer(citation: Citation) {
    setSelectedDrawerData({
      id: citation.id,
      title: citation.title,
      category: citation.category,
      page: citation.page,
      excerpt: citation.excerpt,
      file: citation.file,
    });
    setIsDrawerOpen(true);
  }

  async function askQuestion(value: string) {
    const trimmed = value.trim();
    if (!trimmed || loading) return;

    setQuestion("");
    setError("");
    setShowAllSources(false);
    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "La réponse n'a pas pu être générée.";
        throw new Error(message);
      }

      if (
        typeof data !== "object" ||
        data === null ||
        !("answer" in data) ||
        typeof data.answer !== "string"
      ) {
        throw new Error("La réponse reçue est invalide. Réessayez.");
      }

      const answer = data.answer;
      if (
        !("citations" in data) ||
        !Array.isArray(data.citations) ||
        !data.citations.every(
          (citation): citation is Citation =>
            typeof citation === "object" &&
            citation !== null &&
            "id" in citation &&
            typeof citation.id === "string" &&
            "title" in citation &&
            typeof citation.title === "string" &&
            "category" in citation &&
            typeof citation.category === "string" &&
            "page" in citation &&
            typeof citation.page === "number" &&
            "excerpt" in citation &&
            typeof citation.excerpt === "string" &&
            "file" in citation &&
            typeof citation.file === "string",
        )
      ) {
        throw new Error("Les sources reçues sont invalides. Réessayez.");
      }

      const citations = data.citations;
      setMessages((current) => [
        ...current,
        { role: "assistant", content: answer, citations },
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Une erreur inattendue est survenue.",
      );
    } finally {
      setLoading(false);
      window.setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void askQuestion(question);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void askQuestion(question);
    }
  }

  function startNewConversation() {
    setMessages([]);
    setQuestion("");
    setError("");
    setSidebarOpen(false);
  }

  function handleCopyAnswer(text: string) {
    const clean = text.replace(/\[S\d+\]/g, "").trim();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(clean);
      showToastMessage("Réponse copiée dans le presse-papier !");
    }
  }

  return (
    <main className="app-shell">
      {/* 1. Splash Screen Animation */}
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}

      {/* 2. Fullscreen Mobile & Desktop Onboarding */}
      {showOnboarding && (
        <MobileFullscreenOnboarding onComplete={handleCompleteOnboarding} />
      )}

      {/* 3. Toast Notifications */}
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* 4. Article Drawer */}
      <ArticleDrawer
        data={selectedDrawerData}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onAskAboutArticle={(q) => void askQuestion(q)}
      />

      {/* Sidebar Navigation */}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <a className="brand" href="/" aria-label="Droit Cameroun, accueil">
            <span className="brand-mark">
              <Scale size={20} strokeWidth={2.1} />
            </span>
            <span className="brand-name">droit<span>.cm</span></span>
          </a>
          <button
            className="icon-button sidebar-close"
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={19} />
          </button>
          <button
            className="new-chat-button"
            type="button"
            onClick={startNewConversation}
          >
            <Plus size={17} strokeWidth={2.3} />
            Nouvelle question
            <span className="shortcut">⌘ K</span>
          </button>
        </div>

        <div className="sidebar-section">
          <p className="eyebrow">Explorer par sujet</p>
          <nav className="topic-nav" aria-label="Sujets juridiques">
            {topics.map(({ label, icon: Icon }, index) => (
              <button
                className="topic-link"
                key={label}
                type="button"
                onClick={() => {
                  setSidebarOpen(false);
                  void askQuestion(
                    [
                      "Quels sont mes droits et recours contre les abus selon les textes camerounais ?",
                      "Que prévoient les textes camerounais pour fournir Internet ou créer un opérateur télécom ?",
                      "Que dit la loi camerounaise sur la cybercriminalité et la sécurité des données ?",
                      "Quelles sont les obligations légales du commerce électronique au Cameroun ?",
                      "Que dit la législation camerounaise sur la concurrence et les prix ?",
                    ][index],
                  );
                }}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-foot">
          <div className="sidebar-note">
            <span className="note-icon"><ShieldCheck size={17} /></span>
            <div>
              <strong>43 textes officiels indexés</strong>
              <p>Chaque réponse cite les lois, décrets et décisions de l&apos;ART.</p>
            </div>
          </div>
          <div className="profile-row">
            <span className="profile-avatar">CM</span>
            <span className="profile-copy">
              <strong>Le droit, simplement</strong>
              <small>Assistant Juridique · Cameroun</small>
            </span>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="mobile-scrim"
          type="button"
          aria-label="Fermer le menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Panel */}
      <section className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              type="button"
              aria-label="Ouvrir le menu"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span className="topbar-context">
              <span className="status-dot" /> Assistant juridique
            </span>
          </div>
          <div className="topbar-actions">
            <ThemeToggle />
            <span className="country-tag"><span>🇨🇲</span> Cameroun</span>
            <button
              className="help-button"
              type="button"
              onClick={reopenTutorial}
              aria-label="Aide"
            >
              <HelpCircle size={16} /> Aide
            </button>
            <button
              className="header-new-button"
              type="button"
              onClick={startNewConversation}
            >
              <Plus size={16} /> Nouvelle question
            </button>
          </div>
        </header>

        <div className={`conversation ${messages.length ? "conversation-active" : ""}`}>
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-badge">
                <Scale size={13} />
                <span>Information juridique accessible à tous</span>
              </div>
              <h1>
                Le droit camerounais,
                <br />
                <span>enfin plus clair.</span>
              </h1>
              <p className="welcome-description">
                Posez vos questions par écrit ou au micro et recevez des explications
                fondées sur 43 textes de lois officiels.
              </p>

              {/* Central Floating Composer */}
              <form className="composer composer-welcome" onSubmit={handleSubmit}>
                <textarea
                  ref={textareaRef}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Décrivez votre situation ou posez une question juridique…"
                  aria-label="Votre question juridique"
                  rows={1}
                  maxLength={2000}
                  disabled={loading}
                />
                <div className="composer-bottom">
                  <div className="composer-left-actions">
                    <VoiceInputButton
                      disabled={loading}
                      onTranscript={(text) => setQuestion(text)}
                    />
                    <span className="composer-hint">
                      <Sparkles size={14} /> Répond avec citations précises
                    </span>
                  </div>
                  <button
                    className={`send-button ${question.trim() ? "send-ready" : ""}`}
                    type="submit"
                    aria-label="Envoyer la question"
                    disabled={!question.trim() || loading}
                  >
                    <ArrowUp size={19} strokeWidth={2.2} />
                  </button>
                </div>
              </form>

              {/* Quick Action Chips (One-Click) */}
              <QuickActionChips
                loading={loading}
                onSelectPrompt={(p) => void askQuestion(p)}
              />

              {error && <p className="error-banner" role="alert">{error}</p>}

              {/* Minimalist Card-Based Topic Grid */}
              <TopicCardsGrid
                loading={loading}
                onSelectCard={(p) => void askQuestion(p)}
              />

              {/* 50 Questions Library Toggle */}
              <button
                className="question-library-toggle"
                type="button"
                aria-expanded={showQuestionLibrary}
                onClick={() => setShowQuestionLibrary((current) => !current)}
              >
                {showQuestionLibrary ? "Masquer la bibliothèque" : "Explorer les 50 questions fréquentes"}
                <ChevronDown className={showQuestionLibrary ? "chevron-open" : ""} size={15} />
              </button>

              {showQuestionLibrary && (
                <section className="question-library" aria-label="Bibliothèque des questions">
                  <div className="question-library-intro">
                    <strong>Questions types par activité</strong>
                    <span>Cliquez sur une question pour obtenir sa réponse fondée sur les lois en vigueur.</span>
                  </div>
                  <div className="question-library-filters">
                    <input
                      type="search"
                      value={questionSearch}
                      aria-label="Rechercher une question"
                      placeholder="Rechercher parmi les 50 questions…"
                      onChange={(event) => {
                        setQuestionSearch(event.target.value);
                        setQuestionPage(0);
                      }}
                    />
                    <select
                      value={questionCategory}
                      aria-label="Filtrer les questions par activité"
                      onChange={(event) => {
                        setQuestionCategory(event.target.value);
                        setQuestionPage(0);
                      }}
                    >
                      <option>Toutes les catégories</option>
                      {[...new Set(businessQuestionCategories.map(({ category }) => category))].map(
                        (category) => <option key={category}>{category}</option>,
                      )}
                    </select>
                  </div>

                  {visibleBusinessQuestions.length > 0 ? (
                    <div className="suggestion-grid question-library-grid">
                      {visibleBusinessQuestions.map(({ icon: Icon, category, prompt }) => (
                        <button
                          className="suggestion-card"
                          key={prompt}
                          type="button"
                          onClick={() => void askQuestion(prompt)}
                        >
                          <span className="suggestion-icon cyan"><Icon size={17} strokeWidth={1.8} /></span>
                          <span className="suggestion-copy">
                            <strong>{category}</strong>
                            <small>{prompt}</small>
                          </span>
                          <ArrowLeft className="suggestion-arrow" size={15} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="question-library-empty">Aucune question ne correspond à votre recherche.</p>
                  )}

                  <div className="question-library-pagination">
                    <span>
                      {filteredBusinessQuestions.length === 0
                        ? "0 question"
                        : `${questionPage * questionsPerPage + 1}–${Math.min(
                            (questionPage + 1) * questionsPerPage,
                            filteredBusinessQuestions.length,
                          )} sur ${filteredBusinessQuestions.length} questions`}
                    </span>
                    <div>
                      <button
                        type="button"
                        disabled={questionPage === 0}
                        onClick={() => setQuestionPage((page) => Math.max(0, page - 1))}
                      >
                        Précédent
                      </button>
                      <button
                        type="button"
                        disabled={(questionPage + 1) * questionsPerPage >= filteredBusinessQuestions.length}
                        onClick={() => setQuestionPage((page) => page + 1)}
                      >
                        Suivant
                      </button>
                    </div>
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="message-list">
              <div className="conversation-heading">
                <button className="back-home" type="button" onClick={startNewConversation}>
                  <ArrowLeft size={16} /> Nouvelle question
                </button>
                <span className="conversation-label">VOTRE CONVERSATION</span>
              </div>

              {messages.map((message, index) => (
                <article className={`message message-${message.role}`} key={`${message.role}-${index}`}>
                  {message.role === "assistant" && (
                    <span className="message-avatar"><Scale size={16} /></span>
                  )}
                  <div className="message-content">
                    <div className="message-author">
                      {message.role === "user" ? "Vous" : "Droit.cm"}
                      {message.role === "assistant" && (
                        <span className="answer-source-label">
                          <Sparkles size={12} /> Réponse documentée
                        </span>
                      )}
                    </div>

                    <div className="message-text">
                      {message.role === "assistant"
                        ? formatAnswer(message.content, message.citations, openArticleDrawer)
                        : message.content}
                    </div>

                    {/* Citations Card Grid */}
                    {message.role === "assistant" && message.citations && message.citations.length > 0 && (
                      <div className="sources-block">
                        <div className="sources-title">
                          <span><BookOpen size={15} /> Sources officielles citées</span>
                          <span className="source-count">{message.citations.length} document{message.citations.length > 1 ? "s" : ""}</span>
                        </div>
                        <div className="source-cards">
                          {(showAllSources ? message.citations : message.citations.slice(0, 3)).map((citation) => (
                            <div
                              className="source-card"
                              key={citation.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => openArticleDrawer(citation)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") openArticleDrawer(citation);
                              }}
                              title="Cliquer pour afficher la fiche officielle"
                            >
                              <span className="source-file-icon"><FileText size={16} /></span>
                              <span className="source-copy">
                                <strong>{citation.title}</strong>
                                <small>{citation.category} · page {citation.page}</small>
                              </span>
                              <ExternalLink size={14} className="source-external" />
                            </div>
                          ))}
                        </div>
                        {message.citations.length > 3 && (
                          <button
                            className="show-sources-button"
                            type="button"
                            onClick={() => setShowAllSources((current) => !current)}
                          >
                            {showAllSources ? "Réduire" : `Voir les ${message.citations.length} sources`}
                            <ChevronDown size={14} className={showAllSources ? "rotate-chevron" : ""} />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Action Toolbar under Assistant Message */}
                    {message.role === "assistant" && (
                      <MessageActions
                        content={message.content}
                        citations={message.citations}
                        loading={loading}
                        onCopy={() => handleCopyAnswer(message.content)}
                        onOpenDrawer={(cit) => openArticleDrawer(cit)}
                        onAskFollowUp={(fUp) => void askQuestion(fUp)}
                      />
                    )}
                  </div>
                </article>
              ))}

              {loading && (
                <div className="message message-assistant loading-message">
                  <span className="message-avatar"><Scale size={16} /></span>
                  <div className="message-content">
                    <div className="message-author">
                      Droit.cm <span className="answer-source-label"><Sparkles size={12} /> Analyse des textes en cours</span>
                    </div>
                    <div className="typing-indicator"><span /><span /><span /></div>
                  </div>
                </div>
              )}

              {error && (
                <div className="error-banner conversation-error" role="alert">
                  <span>{error}</span>
                  <button type="button" onClick={() => setError("")} aria-label="Fermer"><X size={15} /></button>
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Bottom Composer when conversation is active */}
        {messages.length > 0 && (
          <div className="bottom-composer-wrap">
            <form className="composer conversation-composer" onSubmit={handleSubmit}>
              <textarea
                ref={textareaRef}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Posez une question complémentaire…"
                aria-label="Question complémentaire"
                rows={1}
                maxLength={2000}
                disabled={loading}
              />
              <div className="composer-bottom">
                <div className="composer-left-actions">
                  <VoiceInputButton
                    disabled={loading}
                    onTranscript={(text) => setQuestion(text)}
                  />
                  <span className="composer-hint">
                    <span className="keyboard-hint">↵</span> Entrée pour envoyer
                  </span>
                </div>
                <button
                  className={`send-button ${question.trim() ? "send-ready" : ""}`}
                  type="submit"
                  aria-label="Envoyer la question"
                  disabled={!question.trim() || loading}
                >
                  <ArrowUp size={19} strokeWidth={2.2} />
                </button>
              </div>
            </form>
            <p className="legal-footnote">
              <ShieldCheck size={13} /> Information générale fondée sur les textes officiels du Cameroun. Ne remplace pas le conseil d&apos;un avocat.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
