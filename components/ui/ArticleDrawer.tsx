"use client";

import {
  ExternalLink,
  FileText,
  Gavel,
  HelpCircle,
  Scale,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

export type DrawerData = {
  title: string;
  category: string;
  page: number;
  excerpt: string;
  file: string;
  id?: string;
};

type ApiDocDetails = {
  id: string;
  title: string;
  shortTitle: string;
  type: string;
  number: string;
  date: string;
  authority: string;
  status: string;
  summary: string;
  domaines: string[];
  sanctions: string[];
  obligations: string[];
  pdfFile: string;
  pages: number;
};

export function ArticleDrawer({
  data,
  isOpen,
  onClose,
  onAskAboutArticle,
}: {
  data: DrawerData | null;
  isOpen: boolean;
  onClose: () => void;
  onAskAboutArticle?: (question: string) => void;
}) {
  const [details, setDetails] = useState<ApiDocDetails | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !data?.file) {
      setDetails(null);
      return;
    }

    let active = true;
    setLoading(true);

    fetch(`/api/article?file=${encodeURIComponent(data.file)}`)
      .then((res) => res.json())
      .then((resData) => {
        if (active && resData.found && resData.document) {
          setDetails(resData.document);
        }
      })
      .catch((err) => {
        console.warn("Could not load article extra details:", err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, data]);

  if (!isOpen || !data) return null;

  const pdfUrl = `/api/document?file=${encodeURIComponent(data.file)}#page=${data.page}`;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside
        className="drawer-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Fiche du texte officiel"
      >
        <div className="drawer-header">
          <div className="drawer-header-left">
            <span className="drawer-badge">
              <Scale size={14} /> Source officielle
            </span>
            {details?.status && (
              <span className="status-pill in-effect">
                <ShieldCheck size={12} /> {details.status}
              </span>
            )}
          </div>
          <button
            className="icon-button drawer-close-btn"
            type="button"
            onClick={onClose}
            aria-label="Fermer le tiroir"
          >
            <X size={18} />
          </button>
        </div>

        <div className="drawer-body">
          <div className="drawer-title-group">
            <h2>{details?.title || data.title}</h2>
            <div className="drawer-meta-pills">
              <span className="meta-pill">{details?.number || data.category}</span>
              <span className="meta-pill">Page {data.page}</span>
              {details?.authority && <span className="meta-pill">{details.authority}</span>}
              {details?.date && <span className="meta-pill">{details.date}</span>}
            </div>
          </div>

          <div className="drawer-card drawer-excerpt-card">
            <div className="drawer-card-title">
              <FileText size={16} /> Extrait pertinent cité
            </div>
            <p className="drawer-excerpt-text">{data.excerpt}</p>
          </div>

          {loading && (
            <div className="drawer-loading">
              <span className="spinner" /> Chargement de l&apos;analyse juridique…
            </div>
          )}

          {details?.summary && (
            <div className="drawer-card">
              <div className="drawer-card-title">
                <Gavel size={16} /> Portée & Objet du texte
              </div>
              <p className="drawer-card-body">{details.summary}</p>
            </div>
          )}

          {details?.obligations && details.obligations.length > 0 && (
            <div className="drawer-card">
              <div className="drawer-card-title">
                <ShieldCheck size={16} /> Obligations principales identifiées
              </div>
              <ul className="drawer-list">
                {details.obligations.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {details?.sanctions && details.sanctions.length > 0 && (
            <div className="drawer-card warning-card">
              <div className="drawer-card-title warning-title">
                <ShieldAlert size={16} /> Sanctions & Pénalités prévues
              </div>
              <ul className="drawer-list">
                {details.sanctions.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="drawer-footer">
          <a
            className="drawer-action-btn primary"
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={16} />
            Consulter le PDF officiel (Page {data.page})
          </a>
          {onAskAboutArticle && (
            <button
              className="drawer-action-btn secondary"
              type="button"
              onClick={() => {
                onClose();
                onAskAboutArticle(
                  `Que prévoit précisément le texte "${details?.shortTitle || data.title}" à propos de cette situation ?`,
                );
              }}
            >
              <HelpCircle size={15} />
              Poser une question sur ce texte
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
