"use client";

import { useState, useEffect, useRef } from "react";
import type { AIProviderModel } from "@aidnd/shared";

function getWorkerUrl(): string {
  return process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";
}

const DEBOUNCE_MS = 500;

export function useModels(
  providerId: string,
  apiKey: string
): {
  models: AIProviderModel[];
  loading: boolean;
  error: string | null;
} {
  const [models, setModels] = useState<AIProviderModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!providerId || !apiKey) {
      setModels([]);
      setError(null);
      setLoading(false);
      return;
    }

    // Show loading immediately while debouncing
    setLoading(true);

    const timer = setTimeout(async () => {
      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setError(null);

      try {
        const res = await fetch(`${getWorkerUrl()}/api/models`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: providerId, apiKey }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            (data as { error?: string }).error || `HTTP ${res.status}`
          );
        }

        const data = (await res.json()) as { models: AIProviderModel[] };
        setModels(data.models);
        setError(null);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
        setModels([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [providerId, apiKey]);

  return { models, loading, error };
}
