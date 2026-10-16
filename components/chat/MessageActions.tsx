"use client";

import { Copy, FileText, HelpCircle, Sparkles } from "lucide-react";
import { AudioSpeakerButton } from "../voice/AudioSpeakerButton";

type Citation = {
  id: string;
  title: string;
  category: string;
  page: number;
  excerpt: string;
  file: string;
};

export function MessageActions({
  content,
  citations,
  onCopy,
  onOpenDrawer,
  onAskFollowUp,
  loading,
}: {
  content: string;
  citations?: Citation[];
  onCopy: () => void;
  onOpenDrawer?: (citation: Citation) => void;
  onAskFollowUp: (followUp: string) => void;
  loading?: boolean;
}) {
  const followUpSuggestions = [
    "Quelles sont les sanctions prévues par la loi en cas de non-respect ?",
    "Quelles démarches concrètes ou autorités contacter pour ce cas ?",
    "Existe-t-il des dérogations ou exceptions prévues par les textes ?",
  ];

  return (
    <div className="message-actions-toolbar">
      {/* Primary Action Buttons */}
      <div className="toolbar-btn-group">
        <button
          className="action-btn copy-btn"
          type="button"
          onClick={onCopy}
          title="Copier le texte de la réponse"
        >
          <Copy size={14} />
          <span>Copier</span>
        </button>

        <AudioSpeakerButton text={content} />

        {citations && citations.length > 0 && onOpenDrawer && (
          <button
            className="action-btn inspect-btn"
            type="button"
            onClick={() => onOpenDrawer(citations[0])}
            title="Consulter les détails des articles officiels cités"
          >
            <FileText size={14} />
            <span>Fiche article ({citations.length})</span>
          </button>
        )}
      </div>

      {/* Dynamic Suggested Follow-ups */}
      <div className="toolbar-followups">
        <span className="followup-label">
          <Sparkles size={13} /> Questions de relance :
        </span>
        <div className="followup-chips-wrap">
          {followUpSuggestions.map((suggestion, idx) => (
            <button
              key={idx}
              className="followup-chip"
              type="button"
              disabled={loading}
              onClick={() => onAskFollowUp(suggestion)}
            >
              <HelpCircle size={13} className="followup-icon" />
              <span>{suggestion}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
