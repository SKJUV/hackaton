"use client";

import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { useEffect } from "react";

export type ToastMessage = {
  id: string;
  type?: "success" | "info" | "error";
  text: string;
};

export function Toast({
  toast,
  onClose,
}: {
  toast: ToastMessage | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onClose();
    }, 3200);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  return (
    <div className={`toast toast-${toast.type || "success"}`} role="status">
      <span className="toast-icon">
        {toast.type === "error" ? (
          <AlertCircle size={16} />
        ) : toast.type === "info" ? (
          <Info size={16} />
        ) : (
          <CheckCircle2 size={16} />
        )}
      </span>
      <span className="toast-text">{toast.text}</span>
      <button
        type="button"
        className="toast-close"
        onClick={onClose}
        aria-label="Fermer la notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}
