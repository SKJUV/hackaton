"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = localStorage.getItem("droit-cm-theme") as "dark" | "light" | null;
    const initial = saved || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("droit-cm-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <button
      className="theme-toggle-btn"
      type="button"
      onClick={toggleTheme}
      title={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
      aria-label="Basculer le thème"
    >
      <span className={`theme-icon-wrap ${theme === "dark" ? "is-dark" : "is-light"}`}>
        {theme === "dark" ? <Sun size={17} strokeWidth={2.2} /> : <Moon size={17} strokeWidth={2.2} />}
      </span>
      <span className="theme-toggle-label">{theme === "dark" ? "Clair" : "Sombre"}</span>
    </button>
  );
}
