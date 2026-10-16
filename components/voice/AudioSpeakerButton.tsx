"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";

function cleanTextForSpeech(raw: string): string {
  return raw
    .replace(/\[S\d+\]/g, "") // remove citation markers
    .replace(/[*_#`]/g, "") // remove markdown formatting
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

export function AudioSpeakerButton({ text }: { text: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setIsSupported(false);
    }

    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function toggleSpeech() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    window.speechSynthesis.cancel();
    const clean = cleanTextForSpeech(text);
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = "fr-FR";
    utterance.rate = 1.02;
    utterance.pitch = 1.0;

    // Pick a natural French voice if available
    const voices = window.speechSynthesis.getVoices();
    const frenchVoice = voices.find(
      (v) => v.lang.startsWith("fr") && (v.name.includes("Natural") || v.name.includes("Google")),
    ) || voices.find((v) => v.lang.startsWith("fr"));

    if (frenchVoice) {
      utterance.voice = frenchVoice;
    }

    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);

    window.speechSynthesis.speak(utterance);
  }

  if (!isSupported) return null;

  return (
    <button
      className={`action-btn audio-speaker-btn ${isPlaying ? "is-playing" : ""}`}
      type="button"
      onClick={toggleSpeech}
      title={isPlaying ? "Arrêter la lecture audio" : "Écouter la réponse à haute voix"}
      aria-label={isPlaying ? "Arrêter la lecture" : "Écouter la réponse"}
    >
      {isPlaying ? (
        <>
          <span className="equalizer-bars">
            <span className="bar bar-1" />
            <span className="bar bar-2" />
            <span className="bar bar-3" />
          </span>
          <VolumeX size={14} />
          <span>Arrêter</span>
        </>
      ) : (
        <>
          <Volume2 size={14} />
          <span>Écouter</span>
        </>
      )}
    </button>
  );
}
