"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { ClientMessage } from "@aidnd/shared/types";

interface UsePlayerNotesOptions {
  send: (msg: ClientMessage) => void;
}

export function usePlayerNotes({ send }: UsePlayerNotesOptions) {
  const [notes, setNotes] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestNotesRef = useRef(notes);

  // Keep ref in sync
  useEffect(() => {
    latestNotesRef.current = notes;
  }, [notes]);

  const handleNotesLoaded = useCallback((content: string) => {
    setNotes(content);
    setSaveState("saved");
  }, []);

  const updateNotes = useCallback(
    (content: string) => {
      setNotes(content);
      setSaveState("unsaved");

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setSaveState("saving");
        send({ type: "client:save_notes", content } as ClientMessage);
        setSaveState("saved");
      }, 1500);
    },
    [send],
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { notes, saveState, updateNotes, handleNotesLoaded };
}
