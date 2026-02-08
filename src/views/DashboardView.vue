<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import Ably from 'ably';
import { useAuthStore } from '@/stores/auth';
import { getAblyStatus, getAblyToken, sendAdminMessage } from '@/api/ably';
import type { PlayerData, ChatEntry } from '@/api/ably';
import PlayerInfoModal from '@/components/PlayerInfoModal.vue';

const auth = useAuthStore();
const ablyStatus = ref<{ configured: boolean; connected: boolean; state: string; error?: string } | null>(null);
const playerList = ref<PlayerData[]>([]);
const playersMap = new Map<string, PlayerData>();
const adminMessage = ref('');
const adminSending = ref(false);
const adminError = ref('');
const wsError = ref('');
const wsConnected = ref(false);
const selectedPlayer = ref<PlayerData | null>(null);
const playerInfoOpen = ref(false);
const chatMap = ref<Map<string, ChatEntry[]>>(new Map());

let statusInterval: ReturnType<typeof setInterval>;
let presenceSyncInterval: ReturnType<typeof setInterval> | null = null;
let ablyClient: Ably.Realtime | null = null;
let channel: Ably.RealtimeChannel | null = null;

function parsePlayer(msg: { data?: unknown }): PlayerData | null {
  try {
    const raw = msg.data;
    if (raw === undefined) return null;
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!d?.playerName) return null;
    return {
      playerName: d.playerName,
      uuid: d.uuid,
      area: d.area,
      subArea: d.subArea,
      partyMembers: d.partyMembers ?? [],
      updatedAt: d.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function addPlayer(p: PlayerData) {
  playersMap.set(p.playerName, p);
  playerList.value = Array.from(playersMap.values());
}

function removePlayer(name: string) {
  playersMap.delete(name);
  playerList.value = Array.from(playersMap.values());
}

async function refreshAblyStatus() {
  try {
    ablyStatus.value = await getAblyStatus();
  } catch {
    ablyStatus.value = null;
  }
}

function connectAbly() {
  if (!auth.isLoggedIn || ablyClient) return;
  wsError.value = '';
  getAblyToken()
    .then(({ token }) => {
      ablyClient = new Ably.Realtime({ token });
      ablyClient.connection.on('connected', async () => {
        wsConnected.value = true;
        wsError.value = '';
        channel = ablyClient!.channels.get('skyblock:players');
        await channel.attach();
        channel.subscribe('update', (msg) => {
          const p = parsePlayer(msg);
          if (p) addPlayer(p);
        });
        channel.subscribe('chat', (msg) => {
          const raw = msg.data;
          if (raw === undefined) return;
          const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const playerName = d?.playerName;
          const message = d?.message;
          const timestamp = d?.timestamp ?? new Date().toISOString();
          if (!playerName || message == null) return;
          const list = chatMap.value.get(playerName) ?? [];
          list.push({ playerName, message: String(message), timestamp });
          if (list.length > 100) list.shift();
          chatMap.value.set(playerName, list);
          chatMap.value = new Map(chatMap.value);
        });
        const syncPresence = async () => {
          try {
            const members = await channel!.presence.get({ waitForSync: true });
            const present = new Set((members ?? []).map((m) => m.clientId).filter(Boolean));
            const now = Date.now();
            for (const [name, p] of playersMap.entries()) {
              if (present.has(name)) continue;
              const updatedMs = new Date(p.updatedAt).getTime();
              if (now - updatedMs < 15000) continue;
              removePlayer(name);
            }
          } catch (_) {}
        };
        channel.presence.subscribe('leave', (msg) => {
          if (msg.clientId) removePlayer(msg.clientId);
        });
        const history = await channel.history({ limit: 100 });
        for (const msg of history.items) {
          if (msg.name === 'update') {
            const p = parsePlayer(msg);
            if (p) addPlayer(p);
          }
          if (msg.name === 'chat') {
            const raw = msg.data;
            if (raw === undefined) continue;
            const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const playerName = d?.playerName;
            const message = d?.message;
            const timestamp = d?.timestamp ?? new Date().toISOString();
            if (!playerName || message == null) continue;
            const list = chatMap.value.get(playerName) ?? [];
            list.push({ playerName, message: String(message), timestamp });
            if (list.length > 100) list.shift();
            chatMap.value.set(playerName, list);
          }
        }
        chatMap.value = new Map(chatMap.value);
        await syncPresence();
        presenceSyncInterval = setInterval(syncPresence, 15000);
      });
      ablyClient.connection.on('failed', (s) => {
        wsConnected.value = false;
        wsError.value = s.reason?.message ?? 'Connection failed';
      });
      ablyClient.connection.on('closed', () => {
        wsConnected.value = false;
        if (channel) channel.presence.unsubscribe();
      });
    })
    .catch((e) => {
      wsError.value = e?.response?.data?.message ?? e?.message ?? 'Failed to get token';
    });
}

function disconnectAbly() {
  if (presenceSyncInterval) {
    clearInterval(presenceSyncInterval);
    presenceSyncInterval = null;
  }
  channel?.unsubscribe();
  channel?.detach();
  ablyClient?.close();
  ablyClient = null;
  channel = null;
  playersMap.clear();
  playerList.value = [];
  chatMap.value = new Map();
  wsConnected.value = false;
}

function openPlayerInfo(p: PlayerData) {
  selectedPlayer.value = p;
  playerInfoOpen.value = true;
}

function chatForPlayer(): ChatEntry[] {
  if (!selectedPlayer.value) return [];
  return chatMap.value.get(selectedPlayer.value.playerName) ?? [];
}

async function doSendAdminMessage() {
  const msg = adminMessage.value.trim();
  if (!msg || adminSending.value) return;
  adminError.value = '';
  adminSending.value = true;
  try {
    await sendAdminMessage(msg);
    adminMessage.value = '';
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } }; message?: string };
    adminError.value = err?.response?.data?.message ?? err?.message ?? 'Failed to send';
  } finally {
    adminSending.value = false;
  }
}

onMounted(async () => {
  await auth.fetchUser();
  refreshAblyStatus();
  connectAbly();
  statusInterval = setInterval(refreshAblyStatus, 15000);
});

onBeforeUnmount(() => {
  clearInterval(statusInterval);
  disconnectAbly();
});
</script>

<template>
  <div class="dashboard">
    <header class="header">
      <h1>Admin Dashboard</h1>
      <div class="user">
        <span>{{ auth.user?.email }}</span>
        <button @click="auth.logout()">Sign out</button>
      </div>
    </header>
    <main class="content">
      <div class="ably-status" v-if="ablyStatus">
        <div class="status-row" :class="{ connected: ablyStatus.connected }">
          <span class="status-dot"></span>
          <span v-if="!ablyStatus.configured">Ably not configured</span>
          <span v-else-if="ablyStatus.connected">Backend ↔ Ably</span>
          <span v-else>Ably {{ ablyStatus.state }}</span>
        </div>
        <p v-if="ablyStatus.error" class="ably-error">{{ ablyStatus.error }}</p>
      </div>

      <div class="ws-status">
        <span class="dot" :class="{ live: wsConnected }"></span>
        <span v-if="wsError" class="err">{{ wsError }}</span>
        <span v-else-if="wsConnected">WebSocket: listening for players</span>
        <span v-else>WebSocket: connecting...</span>
      </div>

      <div class="admin-message-section">
        <h2>Admin message</h2>
        <p class="hint">API → Ably → mods (chat)</p>
        <div class="admin-message-form">
          <input
            v-model="adminMessage"
            type="text"
            placeholder="Message to all players..."
            maxlength="256"
            @keydown.enter="doSendAdminMessage"
          />
          <button @click="doSendAdminMessage" :disabled="adminSending || !adminMessage.trim()">
            {{ adminSending ? 'Sending...' : 'Send' }}
          </button>
        </div>
        <p v-if="adminError" class="admin-error">{{ adminError }}</p>
      </div>

      <div class="player-list-section">
        <h2>Players ({{ playerList.length }})</h2>
        <p class="hint">Real-time from WebSocket</p>
        <div v-for="p in playerList" :key="p.playerName" class="player-card">
          <div class="player-row">
            <div class="player-header">
            <span class="player-name">{{ p.playerName }}</span>
            <span v-if="p.uuid" class="player-uuid">{{ p.uuid }}</span>
            <span v-if="p.area || p.subArea" class="player-area">
              {{ p.area || '?' }}{{ p.subArea ? ` · ${p.subArea}` : '' }}
            </span>
            <span v-else class="player-area faint">—</span>
          </div>
          <button class="info-btn" @click="openPlayerInfo(p)" title="Player info">Info</button>
          </div>
          <ul v-if="p.partyMembers?.length" class="party-members">
            <li v-for="m in p.partyMembers" :key="m.name" :class="{ leader: m.isLeader }">
              {{ m.isLeader ? '♔ ' : '' }}{{ m.rank }}{{ m.rank ? ' ' : '' }}{{ m.name }}
            </li>
          </ul>
          <p v-else class="no-party">No party</p>
          <span class="updated-at">{{ new Date(p.updatedAt).toLocaleTimeString() }}</span>
        </div>
      </div>
      <p v-if="playerList.length === 0 && !wsError" class="no-data">
        No players. Enable Mod Sync, set API URL, join Hypixel.
      </p>

      <PlayerInfoModal
        v-model="playerInfoOpen"
        :player="selectedPlayer"
        :chat-entries="chatForPlayer()"
      />
    </main>
  </div>
</template>

<style scoped>
.dashboard { min-height: 100vh; background: #1a1a2e; }
.header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 2rem; background: #16213e; border-bottom: 1px solid #333; }
.header h1 { margin: 0; color: #eee; font-size: 1.25rem; }
.user { display: flex; align-items: center; gap: 1rem; }
.user span { color: #aaa; font-size: 0.9rem; }
.user button { padding: 0.4rem 0.8rem; border: 1px solid #444; border-radius: 4px; background: transparent; color: #aaa; cursor: pointer; }
.user button:hover { background: #333; color: #fff; }
.content { padding: 2rem; color: #ccc; }
.ably-status { margin-bottom: 0.5rem; }
.ws-status { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.5rem; font-size: 0.9rem; color: #888; }
.ws-status .dot { width: 8px; height: 8px; border-radius: 50%; background: #666; }
.ws-status .dot.live { background: #6ec96e; box-shadow: 0 0 8px #6ec96e; }
.ws-status .err { color: #e88; }
.status-row { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; border-radius: 6px; background: #2a2a3e; color: #888; }
.status-row.connected { background: #1a3a2a; color: #6ec96e; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: #666; }
.status-row.connected .status-dot { background: #6ec96e; box-shadow: 0 0 8px #6ec96e; }
.ably-error { margin: 0.5rem 0 0 1rem; font-size: 0.85rem; color: #e88; }
.hint { margin: -0.25rem 0 0.5rem; font-size: 0.8rem; color: #666; }
.admin-message-section, .player-list-section { margin-bottom: 1.5rem; }
.admin-message-section h2, .player-list-section h2 { margin: 0 0 0.25rem; font-size: 1rem; color: #ccc; }
.admin-message-form { display: flex; gap: 0.5rem; max-width: 400px; }
.admin-message-form input { flex: 1; padding: 0.5rem 0.75rem; border: 1px solid #444; border-radius: 4px; background: #2a2a3e; color: #eee; font-size: 0.9rem; }
.admin-message-form input:focus { outline: none; border-color: #6ec96e; }
.admin-message-form button { padding: 0.5rem 1rem; border: 1px solid #6ec96e; border-radius: 4px; background: #1a3a2a; color: #6ec96e; cursor: pointer; white-space: nowrap; }
.admin-message-form button:hover:not(:disabled) { background: #2a4a3a; }
.admin-message-form button:disabled { opacity: 0.5; cursor: not-allowed; }
.admin-error { margin: 0.5rem 0 0; font-size: 0.85rem; color: #e88; }
.player-card { max-width: 360px; padding: 1rem; margin-bottom: 0.75rem; border-radius: 8px; background: #2a2a3e; color: #ddd; }
.player-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.75rem; }
.player-header { display: flex; flex-direction: column; gap: 0.25rem; flex: 1; min-width: 0; }
.info-btn { flex-shrink: 0; padding: 0.35rem 0.6rem; font-size: 0.8rem; border: 1px solid #555; border-radius: 4px; background: #333; color: #aaa; cursor: pointer; }
.info-btn:hover { background: #444; color: #fff; border-color: #6ec96e; }
.player-name { font-weight: 600; color: #fff; }
.player-uuid { font-size: 0.75rem; color: #666; font-family: monospace; }
.player-area { font-size: 0.85rem; color: #8a8; }
.player-area.faint { color: #666; }
.party-members { margin: 0; padding-left: 1.25rem; list-style: none; }
.party-members li { margin-bottom: 0.25rem; font-size: 0.9rem; }
.party-members li.leader { color: #daa520; }
.updated-at { display: block; margin-top: 0.75rem; font-size: 0.75rem; color: #666; }
.no-party { margin: 0; font-size: 0.9rem; color: #888; }
.no-data { color: #888; font-style: italic; }
</style>
