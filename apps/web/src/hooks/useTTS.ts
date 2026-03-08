"use client";

import { useState, useEffect, useCallback, useRef } from "react";

function stripMarkdown(text: string): string {
  return text
    .replace(/\{(?:place|npc|pc|item|faction):([^}]+)\}/g, "$1") // entity tags
    .replace(/#{1,6}\s+/g, "")       // headings
    .replace(/\*\*(.+?)\*\*/g, "$1")  // bold
    .replace(/\*(.+?)\*/g, "$1")      // italic
    .replace(/__(.+?)__/g, "$1")      // bold alt
    .replace(/_(.+?)_/g, "$1")        // italic alt
    .replace(/~~(.+?)~~/g, "$1")      // strikethrough
    .replace(/`{1,3}[^`]*`{1,3}/g, "") // code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/^>\s+/gm, "")           // blockquotes
    .replace(/^[-*+]\s+/gm, "")       // unordered lists
    .replace(/^\d+\.\s+/gm, "")       // ordered lists
    .replace(/---+/g, "")             // horizontal rules
    .replace(/\n{3,}/g, "\n\n")       // collapse whitespace
    .trim();
}

const VOICE_KEY = "aidnd-tts-voice";
const VOLUME_KEY = "aidnd-tts-volume";

export function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const currentUtterance = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const loadVoices = () => {
      const v = speechSynthesis.getVoices();
      if (v.length > 0) setVoices(v);
    };

    loadVoices();
    speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  const pickVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (voices.length === 0) return null;

    // Check saved preference
    const saved = localStorage.getItem(VOICE_KEY);
    if (saved) {
      const found = voices.find((v) => v.name === saved);
      if (found) return found;
    }

    // Prefer English voices, look for deeper/narrator-style ones
    const english = voices.filter((v) => v.lang.startsWith("en"));
    const preferred = english.find(
      (v) =>
        /male|david|daniel|james|mark|google uk/i.test(v.name) &&
        !/female|zira|hazel/i.test(v.name)
    );
    return preferred || english[0] || voices[0];
  }, [voices]);

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    currentUtterance.current = null;
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      // Stop any current speech
      stop();

      const cleaned = stripMarkdown(text);
      if (!cleaned) return;

      const utterance = new SpeechSynthesisUtterance(cleaned);
      const voice = pickVoice();
      if (voice) {
        utterance.voice = voice;
        localStorage.setItem(VOICE_KEY, voice.name);
      }
      utterance.rate = 0.95;
      utterance.pitch = 0.9;

      // Read volume fresh from localStorage each time
      const storedVol = localStorage.getItem(VOLUME_KEY);
      const vol = storedVol !== null ? parseFloat(storedVol) : 1.0;
      utterance.volume = !isNaN(vol) && vol >= 0 && vol <= 1 ? vol : 1.0;

      utterance.onend = () => {
        currentUtterance.current = null;
        setIsSpeaking(false);
      };
      utterance.onerror = () => {
        currentUtterance.current = null;
        setIsSpeaking(false);
      };

      currentUtterance.current = utterance;
      setIsSpeaking(true);
      speechSynthesis.speak(utterance);
    },
    [stop, pickVoice]
  );

  return { speak, stop, isSpeaking };
}
