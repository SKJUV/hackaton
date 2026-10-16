"use client";

import { Home, MessageSquare, Search, User } from "lucide-react";

export type NavTab = "home" | "diagnostic" | "history" | "profile";

interface FloatingPillNavBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  unreadHistoryCount?: number;
}

export function FloatingPillNavBar({
  activeTab,
  onSelectTab,
}: FloatingPillNavBarProps) {
  return (
    <nav className="floating-dock-wrap" aria-label="Navigation principale">
      <div className="floating-dock-pill">
        {/* 1. Home / Accueil */}
        <button
          type="button"
          className={`dock-btn ${activeTab === "home" ? "active" : ""}`}
          onClick={() => onSelectTab("home")}
          aria-label="Accueil et Chat"
          title="Accueil"
        >
          <Home size={22} strokeWidth={activeTab === "home" ? 2.3 : 1.9} />
          <span className="dock-tooltip">Accueil</span>
        </button>

        {/* 2. Diagnostic & Recherche (Gold Highlight Circle) */}
        <button
          type="button"
          className={`dock-btn dock-btn-highlight ${activeTab === "diagnostic" ? "active" : ""}`}
          onClick={() => onSelectTab("diagnostic")}
          aria-label="Diagnostic de conformité et recherche de lois"
          title="Diagnostic & Lois"
        >
          <span className="dock-gold-circle">
            <Search size={21} strokeWidth={2.4} />
          </span>
          <span className="dock-tooltip">Diagnostic</span>
        </button>

        {/* 3. Historique / Discussions */}
        <button
          type="button"
          className={`dock-btn ${activeTab === "history" ? "active" : ""}`}
          onClick={() => onSelectTab("history")}
          aria-label="Historique des discussions"
          title="Discussions"
        >
          <MessageSquare size={22} strokeWidth={activeTab === "history" ? 2.3 : 1.9} />
          <span className="dock-tooltip">Historique</span>
        </button>

        {/* 4. Profil / Mon Espace */}
        <button
          type="button"
          className={`dock-btn ${activeTab === "profile" ? "active" : ""}`}
          onClick={() => onSelectTab("profile")}
          aria-label="Mon espace et réglages"
          title="Mon Espace"
        >
          <User size={22} strokeWidth={activeTab === "profile" ? 2.3 : 1.9} />
          <span className="dock-tooltip">Mon Espace</span>
        </button>
      </div>
    </nav>
  );
}
