"use client";

import { useState, useEffect, useRef } from "react";
import { AI_PROVIDERS, getProvider } from "@aidnd/shared";
import type { AIConfig, ServerMessage } from "@aidnd/shared/types";
import { useModels } from "@/hooks/useModels";

interface SidebarProps {
  roomCode: string;
  players: string[];
  hostName: string;
  hasApiKey: boolean;
  aiProvider?: string;
  aiModel?: string;
  isHost: boolean;
  pendingPlayers: string[];
  logMessages: ServerMessage[];
  onSetAIConfig: (config: AIConfig) => void;
  onApprove: (playerName: string) => void;
  onReject: (playerName: string) => void;
  onKick: (playerName: string) => void;
}

export function Sidebar({
  roomCode,
  players,
  hostName,
  hasApiKey,
  aiProvider,
  aiModel,
  isHost,
  pendingPlayers,
  logMessages,
  onSetAIConfig,
  onApprove,
  onReject,
  onKick,
}: SidebarProps) {
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [dmCollapsed, setDmCollapsed] = useState(false);
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [provider, setProvider] = useState("anthropic");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [copied, setCopied] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const currentFormProvider = getProvider(provider);
  const { models, loading: modelsLoading } = useModels(provider, apiKeyInput);

  // Sync modelInput with what the dropdown actually shows
  useEffect(() => {
    if (models.length > 0 && !modelInput) {
      setModelInput(models[0].id);
    }
  }, [models, modelInput]);

  // Auto-scroll activity log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logMessages]);

  const copyRoomCode = async () => {
    await navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmitConfig = () => {
    if (!apiKeyInput.trim()) return;
    const config: AIConfig = {
      provider,
      apiKey: apiKeyInput.trim(),
      ...(modelInput ? { model: modelInput } : {}),
    };
    onSetAIConfig(config);
    setShowConfigForm(false);
    setApiKeyInput("");
    setModelInput("");
  };

  return (
    <div className="w-72 border-l border-gray-700 flex flex-col bg-gray-850 shrink-0">
      {/* Room Code */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-500 uppercase tracking-wider">
            Room Code
          </div>
          {isHost && (
            <span className="text-[10px] bg-purple-600/30 text-purple-400 px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider">
              Host
            </span>
          )}
        </div>
        <button
          onClick={copyRoomCode}
          className="text-2xl font-mono font-bold text-purple-400 tracking-widest mt-1
                     hover:text-purple-300 transition-colors"
          title="Click to copy"
        >
          {roomCode}
        </button>
        {copied && (
          <span className="text-xs text-green-400 ml-2">Copied!</span>
        )}
      </div>

      {/* Pending Players (Host only) */}
      {isHost && pendingPlayers.length > 0 && (
        <div className="p-4 border-b border-gray-700 bg-yellow-900/10">
          <div className="text-xs text-yellow-500 uppercase tracking-wider mb-3">
            Join Requests ({pendingPlayers.length})
          </div>
          <ul className="space-y-2">
            {pendingPlayers.map((name) => (
              <li key={name} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <span className="text-sm text-gray-200 flex-1">{name}</span>
                <button
                  onClick={() => onApprove(name)}
                  className="text-xs bg-green-600/20 text-green-400 hover:bg-green-600/40
                             px-2 py-1 rounded transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={() => onReject(name)}
                  className="text-xs bg-red-600/20 text-red-400 hover:bg-red-600/40
                             px-2 py-1 rounded transition-colors"
                >
                  Deny
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Players */}
      <div className="p-4 border-b border-gray-700">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">
          Party ({players.length})
        </div>
        {players.length === 0 ? (
          <p className="text-sm text-gray-600">No players yet...</p>
        ) : (
          <ul className="space-y-2">
            {players.map((name) => (
              <li key={name} className="flex items-center gap-2 text-sm group">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-gray-200 flex-1">
                  {name}
                  {name === hostName && (
                    <span className="text-[10px] text-purple-400 ml-1.5">
                      (host)
                    </span>
                  )}
                </span>
                {isHost && name !== hostName && (
                  <button
                    onClick={() => onKick(name)}
                    className="text-xs text-red-400/60 hover:text-red-400
                               opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Kick player"
                  >
                    Kick
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Activity Log */}
      <div className="border-b border-gray-700 flex flex-col min-h-0">
        <button
          onClick={() => setLogCollapsed(!logCollapsed)}
          className="flex items-center gap-1 p-4 pb-2 w-full text-left"
        >
          <span
            className={`text-[10px] text-gray-600 transition-transform ${logCollapsed ? "" : "rotate-90"}`}
          >
            ▶
          </span>
          <span className="text-xs text-gray-500 uppercase tracking-wider">
            Activity Log
          </span>
          {logMessages.length > 0 && (
            <span className="text-[10px] text-gray-600 ml-auto">
              {logMessages.length}
            </span>
          )}
        </button>
        {!logCollapsed && (
          <div className="px-4 pb-3 overflow-y-auto max-h-40 space-y-1">
            {logMessages.length === 0 ? (
              <p className="text-xs text-gray-600 italic">No activity yet</p>
            ) : (
              logMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`text-xs ${
                    msg.type === "server:error"
                      ? "text-red-400"
                      : "text-gray-500"
                  }`}
                >
                  {msg.type === "server:error" && "message" in msg
                    ? `Error: ${(msg as { message: string }).message}`
                    : "content" in msg
                      ? (msg as { content: string }).content
                      : ""}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        )}
      </div>

      {/* AI Config (Host only) */}
      {isHost && (
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={() => setDmCollapsed(!dmCollapsed)}
            className="flex items-center gap-1 w-full text-left mb-2"
          >
            <span
              className={`text-[10px] text-gray-600 transition-transform ${dmCollapsed ? "" : "rotate-90"}`}
            >
              ▶
            </span>
            <span className="text-xs text-gray-500 uppercase tracking-wider">
              AI Dungeon Master
            </span>
          </button>
          {!dmCollapsed && (
            <div>
              {hasApiKey && !showConfigForm ? (
                <div className="space-y-1">
                  <div className="text-sm text-green-400 flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span>{aiProvider || "Active"}</span>
                  </div>
                  {aiModel && (
                    <div className="text-xs text-gray-500 ml-3.5">
                      {aiModel}
                    </div>
                  )}
                  <button
                    onClick={() => setShowConfigForm(true)}
                    className="text-xs text-purple-400 hover:text-purple-300 underline transition-colors mt-1"
                  >
                    Change provider
                  </button>
                </div>
              ) : showConfigForm ? (
                <div className="space-y-2">
                  {/* Provider select */}
                  <select
                    value={provider}
                    onChange={(e) => {
                      setProvider(e.target.value);
                      setModelInput("");
                    }}
                    className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5
                               text-sm text-gray-200 focus:outline-none focus:ring-1
                               focus:ring-purple-500"
                  >
                    {AI_PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>

                  {/* API Key */}
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={
                      currentFormProvider?.keyPlaceholder ?? "API key..."
                    }
                    className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5
                               text-sm text-gray-200 focus:outline-none focus:ring-1
                               focus:ring-purple-500"
                  />

                  {/* Model select */}
                  {modelsLoading ? (
                    <p className="text-xs text-gray-500">Loading models...</p>
                  ) : models.length > 0 ? (
                    <select
                      value={modelInput || ""}
                      onChange={(e) => setModelInput(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5
                                 text-sm text-gray-200 focus:outline-none focus:ring-1
                                 focus:ring-purple-500"
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleSubmitConfig}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-sm
                                 py-1.5 rounded transition-colors"
                    >
                      Set
                    </button>
                    <button
                      onClick={() => {
                        setShowConfigForm(false);
                        setApiKeyInput("");
                        setModelInput("");
                      }}
                      className="px-3 text-gray-500 hover:text-gray-300 text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>

                  {currentFormProvider?.keyHelpUrl && (
                    <a
                      href={currentFormProvider.keyHelpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-purple-400 hover:text-purple-300 underline block"
                    >
                      Get an API key
                    </a>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowConfigForm(true)}
                  className="text-sm text-purple-400 hover:text-purple-300 underline transition-colors"
                >
                  Configure AI Provider
                </button>
              )}
              <p className="text-xs text-gray-600 mt-2">
                Key stays in your browser. Sent per-request only.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
