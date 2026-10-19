"use client";

import { MessageSquare, Plus, Trash2, Clock, Sparkles } from "lucide-react";

interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  messages: any[];
}

interface ChatHistoryListViewProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (session: ChatSession) => void;
  onDeleteSession: (id: string) => void;
  onStartNewChat: () => void;
}

export function ChatHistoryListView({
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onStartNewChat,
}: ChatHistoryListViewProps) {
  function formatTimestamp(timestamp: number) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffHours < 24 && date.getDate() === now.getDate()) {
      return `Aujourd'hui à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
    }
    if (diffHours < 48) {
      return `Hier à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
    }
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  }

  return (
    <div className="history-view-container">
      <div className="history-view-header">
        <div>
          <h2>Historique de vos discussions</h2>
          <p>Retrouvez vos échanges juridiques précédents et leurs citations officielles.</p>
        </div>
        <button
          type="button"
          className="history-new-chat-cta"
          onClick={onStartNewChat}
        >
          <Plus size={17} strokeWidth={2.3} />
          <span>Nouvelle discussion</span>
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="history-empty-card">
          <div className="empty-icon-circle">
            <MessageSquare size={32} />
          </div>
          <h3>Aucune discussion enregistrée</h3>
          <p>
            Posez une question sur le droit camerounais pour démarrer votre première conversation.
          </p>
          <button
            type="button"
            className="empty-cta-btn"
            onClick={onStartNewChat}
          >
            <Sparkles size={16} />
            <span>Poser une question juridique</span>
          </button>
        </div>
      ) : (
        <div className="history-cards-list">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`history-card-item ${currentSessionId === session.id ? "active-session" : ""}`}
              onClick={() => onSelectSession(session)}
              role="button"
              tabIndex={0}
            >
              <div className="history-card-icon">
                <MessageSquare size={18} />
              </div>
              <div className="history-card-content">
                <strong>{session.title}</strong>
                <div className="history-card-meta">
                  <span>
                    <Clock size={12} /> {formatTimestamp(session.updatedAt)}
                  </span>
                  <span>·</span>
                  <span>{session.messages.length} message{session.messages.length > 1 ? "s" : ""}</span>
                </div>
              </div>
              <button
                type="button"
                className="history-card-delete"
                title="Supprimer la discussion"
                aria-label="Supprimer la discussion"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(session.id);
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
