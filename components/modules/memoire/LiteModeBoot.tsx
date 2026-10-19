"use client";

import { useEffect } from "react";
import "./memoire.css";

export const LITE_KEY = "cofounder-lite";

/** Applique le mode bas débit enregistré (attribut data-lite sur <html>) dès le chargement du workspace. */
export function LiteModeBoot() {
  useEffect(() => {
    if (localStorage.getItem(LITE_KEY) === "1") document.documentElement.setAttribute("data-lite", "1");
  }, []);
  return null;
}

export function setLiteMode(on: boolean) {
  localStorage.setItem(LITE_KEY, on ? "1" : "0");
  if (on) document.documentElement.setAttribute("data-lite", "1");
  else document.documentElement.removeAttribute("data-lite");
}
