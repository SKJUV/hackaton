"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/workspace/ui";
import type { MemoireOverview } from "@/lib/modules/memoire/overview";

/** Charge la vue d'ensemble du module mémoire pour l'entreprise courante. */
export function useMemoire(companyId: string) {
  const [data, setData] = useState<MemoireOverview | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      setData(await api<MemoireOverview>(`/api/memoire?companyId=${encodeURIComponent(companyId)}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }, [companyId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, reload };
}

export const TAB_FOR: Record<string, string> = { document: "documents", email: "envoi", reunion: "reunion", journal: "journal", message: "agent", decision: "memoire", tache: "taches" };

export function pdfHref(file: string, page: number) {
  return file && /\.pdf$/i.test(file) ? `/api/document?file=${encodeURIComponent(file)}#page=${page}` : null;
}
