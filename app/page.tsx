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
  Menu,
  MessageCircle,
  Plus,
  Scale,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

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

const suggestions = [
  {
    icon: ShieldCheck,
    title: "Mes droits de consommateur",
    prompt: "Quels sont mes droits si un opérateur me facture un service non demandé ?",
    tint: "mint",
  },
  {
    icon: Globe2,
    title: "Sécurité sur internet",
    prompt: "Que dit la loi camerounaise sur la cybercriminalité et mes données ?",
    tint: "lavender",
  },
  {
    icon: MessageCircle,
    title: "Téléphonie et internet",
    prompt: "Quels recours ai-je si mon réseau téléphonique ne fonctionne pas ?",
    tint: "peach",
  },
  {
    icon: BookOpen,
    title: "Comprendre un texte",
    prompt: "Explique-moi simplement les règles du commerce électronique au Cameroun.",
    tint: "blue",
  },
];

const topics = [
  { label: "Droits du consommateur", icon: ShieldCheck },
  { label: "Télécommunications", icon: Globe2 },
  { label: "Cybercriminalité", icon: ShieldCheck },
  { label: "Commerce électronique", icon: BookOpen },
  { label: "Concurrence", icon: Gavel },
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [question]);

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
            : "La réponse n’a pas pu être générée.";
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

  return (
    <main className="app-shell">
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
                      "Quels sont mes droits et recours selon les textes camerounais ?",
                      "Que disent les textes camerounais sur les télécommunications ?",
                      "Que disent les textes camerounais sur la cybersécurité ?",
                      "Que disent les textes camerounais sur le commerce électronique ?",
                      "Que disent les textes camerounais sur la concurrence ?",
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
              <strong>Des réponses sourcées</strong>
              <p>Chaque réponse s’appuie sur les documents disponibles.</p>
            </div>
          </div>
          <div className="profile-row">
            <span className="profile-avatar">CM</span>
            <span className="profile-copy">
              <strong>Le droit, simplement</strong>
              <small>Assistant juridique · Cameroun</small>
            </span>
            <ChevronDown size={15} className="profile-chevron" />
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
            <span className="topbar-context"><span className="status-dot" /> Assistant juridique</span>
          </div>
          <div className="topbar-actions">
            <span className="country-tag"><span>🇨🇲</span> Cameroun</span>
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
                <span className="welcome-badge-icon"><Scale size={15} /></span>
                Comprendre ses droits devrait être simple
              </div>
              <h1>
                Le droit camerounais,
                <br />
                <span>enfin plus clair.</span>
              </h1>
              <p className="welcome-description">
                Posez votre question en mots simples. Explorez les textes de loi
                camerounais et comprenez ce qu’ils signifient pour vous.
              </p>

              <form className="composer composer-welcome" onSubmit={handleSubmit}>
                <textarea
                  ref={textareaRef}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Décrivez votre situation ou posez une question…"
                  aria-label="Votre question juridique"
                  rows={1}
                  maxLength={2000}
                  disabled={loading}
                />
                <div className="composer-bottom">
                  <span className="composer-hint">
                    <Sparkles size={14} /> Réponses basées sur les textes disponibles
                  </span>
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
              {error && <p className="error-banner" role="alert">{error}</p>}

              <div className="suggestion-heading">
                <span>Pour commencer</span>
                <span className="suggestion-line" />
              </div>
              <div className="suggestion-grid">
                {suggestions.map(({ icon: Icon, title, prompt, tint }) => (
                  <button
                    className="suggestion-card"
                    key={title}
                    type="button"
                    onClick={() => void askQuestion(prompt)}
                  >
                    <span className={`suggestion-icon ${tint}`}><Icon size={18} strokeWidth={1.8} /></span>
                    <span className="suggestion-copy">
                      <strong>{title}</strong>
                      <small>{prompt}</small>
                    </span>
                    <ArrowLeft className="suggestion-arrow" size={15} />
                  </button>
                ))}
              </div>
              <div className="trust-note">
                <ShieldCheck size={15} />
                <span>Information générale — pas un avis juridique personnalisé.</span>
              </div>
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
                      {message.role === "assistant" && <span className="answer-source-label"><Sparkles size={12} /> Réponse documentée</span>}
                    </div>
                    <div className="message-text">{message.content}</div>
                    {message.role === "assistant" && message.citations && message.citations.length > 0 && (
                      <div className="sources-block">
                        <div className="sources-title">
                          <span><BookOpen size={15} /> Sources consultées</span>
                          <span className="source-count">{message.citations.length} document{message.citations.length > 1 ? "s" : ""}</span>
                        </div>
                        <div className="source-cards">
                          {(showAllSources ? message.citations : message.citations.slice(0, 3)).map((citation) => (
                            <a
                              className="source-card"
                              href={`/api/document?file=${encodeURIComponent(citation.file)}#page=${citation.page}`}
                              key={citation.id}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <span className="source-file-icon"><FileText size={16} /></span>
                              <span className="source-copy">
                                <strong>{citation.title}</strong>
                                <small>{citation.category} · page {citation.page}</small>
                              </span>
                              <ExternalLink size={14} className="source-external" />
                            </a>
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
                    {message.role === "assistant" && (!message.citations || message.citations.length === 0) && (
                      <div className="no-sources-note">
                        <ShieldCheck size={15} /> Cette réponse ne cite pas de document particulier.
                      </div>
                    )}
                  </div>
                </article>
              ))}
              {loading && (
                <div className="message message-assistant loading-message">
                  <span className="message-avatar"><Scale size={16} /></span>
                  <div className="message-content">
                    <div className="message-author">Droit.cm <span className="answer-source-label"><Sparkles size={12} /> Recherche dans les textes</span></div>
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
                <span className="composer-hint"><span className="keyboard-hint">↵</span> Entrée pour envoyer · Maj + Entrée pour une ligne</span>
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
            <p className="legal-footnote"><ShieldCheck size={13} /> Vérifiez toujours une information importante auprès d’un professionnel ou d’un organisme compétent.</p>
          </div>
        )}
      </section>
    </main>
  );
}
