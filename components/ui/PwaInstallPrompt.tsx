"use client";

import { Check, Download, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosTip, setShowIosTip] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode
    if (
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true)
    ) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS Safari
    if (typeof window !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
      setIsIos(true);
    }

    // Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("PWA Service Worker registered:", reg.scope);
        })
        .catch((err) => {
          console.warn("PWA Service Worker registration failed:", err);
        });
    }

    // Capture beforeinstallprompt (Android, Chrome, Edge)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  async function handleInstallClick() {
    if (isInstalled) return;

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setIsInstalled(true);
        setIsInstallable(false);
        setDeferredPrompt(null);
      }
      return;
    }

    if (isIos) {
      setShowIosTip(true);
      window.setTimeout(() => setShowIosTip(false), 6000);
      return;
    }

    // Desktop Chrome / Edge fallback
    alert(
      "Pour installer Droit.cm sur votre ordinateur ou mobile :\nCliquez sur l'icône d'installation (⊕) dans la barre d'adresse de votre navigateur ou dans le menu ⋮ > 'Installer l'application'.",
    );
  }

  if (isInstalled) {
    return (
      <span className="pwa-installed-tag">
        <Check size={14} />
        <span>Installée</span>
      </span>
    );
  }

  return (
    <div className="pwa-prompt-container">
      <button
        className="pwa-install-btn"
        type="button"
        onClick={handleInstallClick}
        title="Installer l'application sur votre appareil pour un accès hors-ligne"
        aria-label="Installer l'application"
      >
        <Download size={14} />
        <span>{isInstallable ? "Installer l'app" : isIos ? "Installer sur iOS" : "Installer la PWA"}</span>
      </button>

      {showIosTip && (
        <div className="ios-install-tooltip">
          <Share2 size={16} />
          <span>Sur Safari iOS : appuyez sur le bouton <strong>Partager</strong> puis sélectionnez <strong>« Sur l&apos;écran d&apos;accueil »</strong>.</span>
        </div>
      )}
    </div>
  );
}
