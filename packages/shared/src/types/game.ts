export interface Player {
  name: string;
  connectedAt: number;
  isHost?: boolean;
}

export interface RoomState {
  roomCode: string;
  players: Player[];
  hasApiKey: boolean;
  createdAt: number;
  aiProvider?: string;
  aiModel?: string;
}
