"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

function cleanTextForSpeech(raw: string): string {
  return raw
    .replace(/\[S\d+\]/g, "") // remove citation markers
    .replace(/[*_#`~]/g, "") // remove markdown symbols
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

export function AudioSpeakerButton({ text }: { text: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setIsSupported(false);
    }

    return () => {
      stopSpeech();
    };
  }, []);

  function stopSpeech() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    setIsPlaying(false);
    utteranceRef.current = null;
  }

  function toggleSpeech() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    if (isPlaying) {
      stopSpeech();
      return;
    }

    // Stop any existing speech
    stopSpeech();

    const clean = cleanTextForSpeech(text);
    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = "fr-FR";
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Store in ref to prevent garbage collection in Chrome
    utteranceRef.current = utterance;

    // Pick a natural French voice if available
    const voices = window.speechSynthesis.getVoices();
    const frenchVoice =
      voices.find(
        (v) =>
          v.lang.startsWith("fr") &&
          (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Thomas") || v.name.includes("Amelie")),
      ) || voices.find((v) => v.lang.startsWith("fr"));

    if (frenchVoice) {
      utterance.voice = frenchVoice;
    }

    utterance.onstart = () => {
      setIsPlaying(true);
      // Chromium bugfix: speech synthesis stops after ~14s without heartbeat
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        if (typeof window !== "undefined" && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 9000);
    };

    utterance.onend = () => {
      stopSpeech();
    };

    utterance.onerror = (e) => {
      console.warn("Speech synthesis error event:", e);
      stopSpeech();
    };

    window.speechSynthesis.speak(utterance);
  }

  if (!isSupported) return null;

  return (
    <button
      className={`action-btn audio-speaker-btn ${isPlaying ? "is-playing" : ""}`}
      type="button"
      onClick={toggleSpeech}
      title={isPlaying ? "Arrêter la lecture audio" : "Écouter la réponse en continu"}
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
