"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { serverMessageSchema } from "@aidnd/shared/schemas";
import type { AIConfig, ClientMessage, ServerMessage } from "@aidnd/shared/types";

export type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

interface UseWebSocketOptions {
  roomCode: string;
  playerName: string;
  aiConfig?: AIConfig;
  authToken?: string;
  guestId?: string;
  password?: string;
  onMessage: (msg: ServerMessage) => void;
  /** When false, the hook will not attempt to connect. Defaults to true. */
  enabled?: boolean;
}

const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const BASE_RECONNECT_DELAY = 1000; // 1 second

export function useWebSocket({
  roomCode,
  playerName,
  aiConfig,
  authToken,
  guestId,
  password,
  onMessage,
  enabled = true,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);

  // Stable serialization to avoid reconnection loops from object reference changes
  const aiConfigJson = aiConfig ? JSON.stringify(aiConfig) : undefined;

  useEffect(() => {
    if (!enabled) return;

    intentionalCloseRef.current = false;
    reconnectAttemptRef.current = 0;

    function connect() {
      const workerUrl =
        process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";
      const wsUrl =
        workerUrl.replace(/^http/, "ws") + `/api/rooms/${roomCode}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const isReconnect = reconnectAttemptRef.current > 0;
      setConnectionState(isReconnect ? "reconnecting" : "connecting");

      ws.onopen = () => {
        setConnectionState("connected");
        reconnectAttemptRef.current = 0;

        const joinMsg: Record<string, unknown> = {
          type: "client:join",
          playerName,
          roomCode,
        };
        if (aiConfigJson) {
          joinMsg.aiConfig = JSON.parse(aiConfigJson);
        }
        if (authToken) {
          joinMsg.authToken = authToken;
        }
        if (guestId) {
          joinMsg.guestId = guestId;
        }
        if (password) {
          joinMsg.password = password;
        }
        ws.send(JSON.stringify(joinMsg));
      };

      ws.onmessage = (event) => {
        if (event.data === "pong") return;

        try {
          const data = JSON.parse(event.data);
          const result = serverMessageSchema.safeParse(data);
          if (result.success) {
            onMessageRef.current(result.data);
          } else {
            console.warn("Invalid server message:", data);
          }
        } catch {
          console.warn("Failed to parse message:", event.data);
        }
      };

      ws.onclose = (event) => {
        setConnectionState("disconnected");

        // Don't reconnect if intentionally closed or kicked/rejected
        if (
          intentionalCloseRef.current ||
          event.code === 4001 || // Rejected
          event.code === 4002 || // Kicked
          event.code === 1000 // Normal close
        ) {
          return;
        }

        // Schedule reconnection with exponential backoff
        const delay = Math.min(
          BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptRef.current),
          MAX_RECONNECT_DELAY
        );
        reconnectAttemptRef.current++;

        setConnectionState("reconnecting");
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!intentionalCloseRef.current) {
            connect();
          }
        }, delay);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
    }

    connect();

    // Keep-alive ping every 30s
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send("ping");
      }
    }, 30000);

    return () => {
      intentionalCloseRef.current = true;
      clearInterval(pingInterval);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close(1000, "Component unmount");
    };
  }, [roomCode, playerName, aiConfigJson, authToken, guestId, password, enabled]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { send, connectionState };
}
