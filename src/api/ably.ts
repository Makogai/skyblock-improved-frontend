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

export async function getPlayerSession(
  playerName: string,
): Promise<{ accessToken: string | null; timestamp?: string }> {
  const { data } = await api.get<{ accessToken: string | null; timestamp?: string }>(
    `/mod/session/${encodeURIComponent(playerName)}`,
  );
  return data;
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

/** URL for a player's latest screenshot (append ?t=timestamp for cache busting) */
export function screenshotUrl(playerName: string, timestamp?: string): string {
  const base = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '/api' : '');
  const url = `${base}/mod/screenshots/${encodeURIComponent(playerName)}`;
  return timestamp ? `${url}?t=${encodeURIComponent(timestamp)}` : url;
}
