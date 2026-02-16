import { z } from "zod";

// === Auth schemas ===

export const authUserSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  email: z.string(),
  avatarUrl: z.string().optional(),
});

// === AI Config schema ===

export const aiConfigSchema = z.object({
  provider: z.string().min(1),
  apiKey: z.string().min(1),
  model: z.string().optional(),
});

// === Client → Server schemas ===

export const clientChatSchema = z.object({
  type: z.literal("client:chat"),
  content: z.string().min(1).max(2000),
  playerName: z.string().min(1).max(30),
});

export const clientJoinSchema = z.object({
  type: z.literal("client:join"),
  playerName: z.string().min(1).max(30),
  roomCode: z.string().length(6),
  aiConfig: aiConfigSchema.optional(),
  authToken: z.string().optional(),
  guestId: z.string().optional(),
  apiKey: z.string().optional(),
});

export const clientSetAIConfigSchema = z.object({
  type: z.literal("client:set_ai_config"),
  aiConfig: aiConfigSchema,
});

export const clientApproveJoinSchema = z.object({
  type: z.literal("client:approve_join"),
  playerName: z.string().min(1).max(30),
});

export const clientRejectJoinSchema = z.object({
  type: z.literal("client:reject_join"),
  playerName: z.string().min(1).max(30),
});

export const clientKickPlayerSchema = z.object({
  type: z.literal("client:kick_player"),
  playerName: z.string().min(1).max(30),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  clientChatSchema,
  clientJoinSchema,
  clientSetAIConfigSchema,
  clientApproveJoinSchema,
  clientRejectJoinSchema,
  clientKickPlayerSchema,
]);

// === Server → Client schemas ===

export const serverChatSchema = z.object({
  type: z.literal("server:chat"),
  content: z.string(),
  playerName: z.string(),
  timestamp: z.number(),
  id: z.string(),
});

export const serverAISchema = z.object({
  type: z.literal("server:ai"),
  content: z.string(),
  timestamp: z.number(),
  id: z.string(),
});

export const serverSystemSchema = z.object({
  type: z.literal("server:system"),
  content: z.string(),
  timestamp: z.number(),
});

export const serverRoomJoinedSchema = z.object({
  type: z.literal("server:room_joined"),
  roomCode: z.string(),
  players: z.array(z.string()),
  hostName: z.string(),
  hasApiKey: z.boolean(),
  aiProvider: z.string().optional(),
  aiModel: z.string().optional(),
  isHost: z.boolean().optional(),
  isReconnect: z.boolean().optional(),
  user: authUserSchema.optional(),
});

export const serverPlayerJoinedSchema = z.object({
  type: z.literal("server:player_joined"),
  playerName: z.string(),
  players: z.array(z.string()),
  hostName: z.string(),
});

export const serverPlayerLeftSchema = z.object({
  type: z.literal("server:player_left"),
  playerName: z.string(),
  players: z.array(z.string()),
  hostName: z.string(),
});

export const serverErrorSchema = z.object({
  type: z.literal("server:error"),
  message: z.string(),
  code: z.string(),
});

export const serverJoinPendingSchema = z.object({
  type: z.literal("server:join_pending"),
  roomCode: z.string(),
  position: z.number().optional(),
});

export const serverJoinRequestSchema = z.object({
  type: z.literal("server:join_request"),
  playerName: z.string(),
  avatarUrl: z.string().optional(),
});

export const serverKickedSchema = z.object({
  type: z.literal("server:kicked"),
  reason: z.string(),
});

export const serverMessageSchema = z.discriminatedUnion("type", [
  serverChatSchema,
  serverAISchema,
  serverSystemSchema,
  serverRoomJoinedSchema,
  serverPlayerJoinedSchema,
  serverPlayerLeftSchema,
  serverErrorSchema,
  serverJoinPendingSchema,
  serverJoinRequestSchema,
  serverKickedSchema,
]);
