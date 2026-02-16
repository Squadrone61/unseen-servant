"use client";

import { useState, useEffect, useCallback } from "react";
import type { AuthUser } from "@aidnd/shared/types";

function getWorkerUrl(): string {
  return process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";
}

interface UseAuthReturn {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: () => void;
  logout: () => void;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for token in URL params (OAuth callback return)
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    const authError = params.get("auth_error");

    if (urlToken) {
      localStorage.setItem("auth_token", urlToken);
      // Clean up URL without reload
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }

    if (authError) {
      console.error("Auth error:", authError);
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }

    // Validate existing token
    const storedToken = urlToken || localStorage.getItem("auth_token");
    if (!storedToken) {
      setLoading(false);
      return;
    }

    validateToken(storedToken);
  }, []);

  const validateToken = async (tokenToValidate: string) => {
    try {
      const res = await fetch(`${getWorkerUrl()}/api/auth/me`, {
        headers: { Authorization: `Bearer ${tokenToValidate}` },
      });

      if (res.ok) {
        const userData = (await res.json()) as AuthUser;
        setUser(userData);
        setToken(tokenToValidate);
      } else {
        // Token invalid or expired — clear it
        localStorage.removeItem("auth_token");
        setUser(null);
        setToken(null);
      }
    } catch {
      // Network error — keep token but don't set user
      // Will try again on next page load
      setToken(tokenToValidate);
    } finally {
      setLoading(false);
    }
  };

  const login = useCallback(() => {
    window.location.href = `${getWorkerUrl()}/api/auth/google`;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("auth_token");
    setUser(null);
    setToken(null);
  }, []);

  return { user, token, loading, login, logout };
}
