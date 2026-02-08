import api from './client';

export interface AblyStatus {
  configured: boolean;
  connected: boolean;
  state: string;
  error?: string;
}

export async function getAblyStatus(): Promise<AblyStatus> {
  const { data } = await api.get<AblyStatus>('/ably/status');
  return data;
}

export async function getAblyToken(): Promise<{ token: string }> {
  const { data } = await api.get<{ token: string }>('/ably/token');
  return data;
}

export async function sendAdminMessage(message: string): Promise<void> {
  await api.post('/mod/admin-message', { message });
}

export async function sendPlayerCommand(playerName: string, command: string): Promise<void> {
  await api.post('/mod/player-command', { playerName, command });
}

export interface PlayerData {
  playerName: string;
  uuid?: string;
  area?: string;
  subArea?: string;
  partyMembers: Array<{ name: string; rank: string; isLeader: boolean }>;
  updatedAt: string;
}

export interface ChatEntry {
  playerName: string;
  message: string;
  timestamp: string;
}
