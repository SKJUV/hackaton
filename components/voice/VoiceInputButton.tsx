"use client";

import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

export function VoiceInputButton({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<any>(null);
  const shouldListenRef = useRef(false);
  const accumulatedTextRef = useRef("");
  const restartTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const win = typeof window !== "undefined" ? (window as unknown as IWindow) : null;
    const SpeechRecognition = win?.SpeechRecognition || win?.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      // Continuous mode to keep listening across pauses
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "fr-FR";
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let currentSessionFinal = "";
        let currentInterim = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            currentSessionFinal += transcript + " ";
          } else {
            currentInterim += transcript;
          }
        }

        if (currentSessionFinal) {
          accumulatedTextRef.current = (
            accumulatedTextRef.current + " " + currentSessionFinal
          ).replace(/\s+/g, " ").trim();
        }

        const fullDisplay = (
          accumulatedTextRef.current +
          (currentInterim ? " " + currentInterim : "")
        ).replace(/\s+/g, " ").trim();

        if (fullDisplay) {
          onTranscript(fullDisplay);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition event:", event.error);
        // 'no-speech' happens when user pauses: do NOT stop!
        if (event.error === "no-speech") {
          return;
        }
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          shouldListenRef.current = false;
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        // If the user hasn't explicitly stopped, keep listening!
        if (shouldListenRef.current) {
          if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
          restartTimerRef.current = setTimeout(() => {
            if (shouldListenRef.current) {
              try {
                recognition.start();
              } catch (err) {
                console.warn("Speech restart retry:", err);
              }
            }
          }, 150);
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
    } catch (e) {
      console.warn("Speech recognition init error:", e);
      setIsSupported(false);
    }

    return () => {
      shouldListenRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, [onTranscript]);

  function toggleListening() {
    if (!recognitionRef.current) return;

    if (shouldListenRef.current) {
      // User explicitly stopped
      shouldListenRef.current = false;
      setIsListening(false);
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    } else {
      // User started listening
      shouldListenRef.current = true;
      setIsListening(true);
      accumulatedTextRef.current = ""; // Reset accumulated on fresh start
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.warn("Speech start error:", err);
        // Might already be running, set state to true
      }
    }
  }

  if (!isSupported) return null;

  return (
    <button
      className={`voice-mic-btn ${isListening ? "is-listening" : ""}`}
      type="button"
      onClick={toggleListening}
      disabled={disabled}
      title={isListening ? "Arrêter l'écoute vocale" : "Maintenir le micro pour parler (Français)"}
      aria-label={isListening ? "Arrêter l'écoute" : "Poser votre question à la voix"}
    >
      {isListening ? (
        <>
          <span className="mic-wave" />
          <span className="mic-wave delay" />
          <MicOff size={18} className="mic-icon pulse" />
        </>
      ) : (
        <Mic size={18} className="mic-icon" />
      )}
    </button>
  );
}
