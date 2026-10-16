"use client";

import { Mic, MicOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

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

  // Store callback in ref so parent re-renders NEVER recreate listeners or trigger cleanup
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const recognitionRef = useRef<any>(null);
  const shouldListenRef = useRef(false);
  const accumulatedTextRef = useRef("");
  const restartTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startSession = useCallback(() => {
    const win = typeof window !== "undefined" ? (window as unknown as IWindow) : null;
    const SpeechRecognition = win?.SpeechRecognition || win?.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    try {
      // Abort previous instance if any
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "fr-FR";
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let sessionFinal = "";
        let sessionInterim = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            sessionFinal += item[0].transcript + " ";
          } else {
            sessionInterim += item[0].transcript;
          }
        }

        if (sessionFinal) {
          accumulatedTextRef.current = (
            accumulatedTextRef.current + " " + sessionFinal
          ).replace(/\s+/g, " ").trim();
        }

        const totalTranscript = (
          accumulatedTextRef.current +
          (sessionInterim ? " " + sessionInterim : "")
        ).replace(/\s+/g, " ").trim();

        if (totalTranscript && onTranscriptRef.current) {
          onTranscriptRef.current(totalTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        // 'no-speech' is triggered when pausing - do NOT abort!
        if (event.error === "no-speech") {
          return;
        }
        console.warn("Speech recognition event:", event.error);
        if (
          event.error === "not-allowed" ||
          event.error === "service-not-allowed" ||
          event.error === "audio-capture"
        ) {
          shouldListenRef.current = false;
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        // If user hasn't explicitly clicked stop, keep listening by restarting smoothly
        if (shouldListenRef.current) {
          if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
          restartTimerRef.current = setTimeout(() => {
            if (shouldListenRef.current) {
              startSession();
            }
          }, 80);
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn("Speech recognition session start error:", err);
      // Retry once after 200ms if needed
      if (shouldListenRef.current) {
        setTimeout(() => {
          if (shouldListenRef.current) startSession();
        }, 200);
      }
    }
  }, []);

  const stopSession = useCallback(() => {
    shouldListenRef.current = false;
    setIsListening(false);
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
  }, []);

  // Check support on mount only once
  useEffect(() => {
    const win = typeof window !== "undefined" ? (window as unknown as IWindow) : null;
    const SpeechRecognition = win?.SpeechRecognition || win?.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
    }

    return () => {
      shouldListenRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []); // Empty dependency array ensures listeners are NEVER reset on parent re-renders!

  function toggleListening() {
    if (shouldListenRef.current) {
      stopSession();
    } else {
      shouldListenRef.current = true;
      accumulatedTextRef.current = "";
      startSession();
    }
  }

  if (!isSupported) return null;

  return (
    <button
      className={`voice-mic-btn ${isListening ? "is-listening" : ""}`}
      type="button"
      onClick={toggleListening}
      disabled={disabled}
      title={isListening ? "Arrêter l'écoute vocale" : "Parler au micro (Français)"}
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
