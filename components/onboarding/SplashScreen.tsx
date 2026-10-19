"use client";

import { useEffect, useState } from "react";

export function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    // Show splash for 1.8s then fade out
    const timer = setTimeout(() => {
      setFadingOut(true);
      const exitTimer = setTimeout(onFinish, 450);
      return () => clearTimeout(exitTimer);
    }, 1800);

    return () => clearTimeout(timer);
  }, [onFinish]);

  function handleSkip() {
    setFadingOut(true);
    setTimeout(onFinish, 300);
  }

  return (
    <div
      className={`splash-overlay ${fadingOut ? "splash-fade-out" : ""}`}
      onClick={handleSkip}
      role="banner"
      aria-label="Chargement de Fama AI"
    >
      <div className="splash-ambient-glow" />

      <div className="splash-content">
        {/* Animated Logo Formation */}
        <div className="splash-logo-wrap">
          <svg
            className="splash-svg-logo"
            viewBox="0 0 100 100"
            width="100"
            height="100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Outer Glow Ring */}
            <circle
              className="anim-draw-ring"
              cx="50"
              cy="50"
              r="44"
              stroke="url(#splash-cyan-gradient)"
              strokeWidth="2.5"
            />
            {/* Center Pillar */}
            <path
              className="anim-draw-pillar"
              d="M50 24 V76 M42 76 H58 M36 80 H64"
              stroke="#38bdf8"
              strokeWidth="3"
              strokeLinecap="round"
            />
            {/* Balance Beam */}
            <path
              className="anim-draw-beam"
              d="M26 36 Q50 30 74 36"
              stroke="#06b6d4"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            {/* Left Pan */}
            <path
              className="anim-draw-pans"
              d="M26 36 L18 54 M26 36 L34 54 M15 54 Q26 62 37 54 Z"
              stroke="#10b981"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Right Pan */}
            <path
              className="anim-draw-pans delay"
              d="M74 36 L66 54 M74 36 L82 54 M63 54 Q74 62 85 54 Z"
              stroke="#10b981"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Pivot Gold Dot */}
            <circle className="anim-pop-dot" cx="50" cy="24" r="3.5" fill="#f59e0b" />

            <defs>
              <linearGradient
                id="splash-cyan-gradient"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="50%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Brand Name Formation */}
        <div className="splash-text-group">
          <h1 className="splash-brand-title">
            droit<span className="splash-dot-cm">.cm</span>
          </h1>
          <p className="splash-brand-subtitle">
            L&apos;information juridique en toute clarté
          </p>
        </div>

        {/* Subtle Indicator */}
        <div className="splash-dots">
          <span className="splash-dot" />
          <span className="splash-dot" />
          <span className="splash-dot" />
        </div>
      </div>
    </div>
  );
}
