export interface Player {
  name: string;
  connectedAt: number;
  isHost?: boolean;
}

export interface RoomState {
  roomCode: string;
  players: Player[];
  dmConnected: boolean;
  createdAt: number;
}
