<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { sendPlayerCommand, getPlayerSession, getSkyCryptNetworth } from '@/api/ably';
import type { PlayerData, ChatEntry } from '@/api/ably';
import { getSkyBlockProfiles, skyCryptUrl, hasHypixelKey, type HypixelStats } from '@/api/hypixel';
import { playerSkinUrl, parseMcFormat } from '@/utils/minecraft';

const props = defineProps<{
  player: PlayerData | null;
  chatEntries: ChatEntry[];
  screenshotUrl?: string | null;
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
}>();

const command = ref('');
const sending = ref(false);
const error = ref('');
const chatListRef = ref<HTMLElement | null>(null);
const sessionToken = ref<string | null>(null);
const sessionLoading = ref(false);
const sessionCopied = ref(false);
const hypixelStats = ref<HypixelStats | null>(null);
const hypixelLoading = ref(false);
const hypixelError = ref<string | null>(null);
const skyCryptNetworth = ref<number | null>(null);
const collapsed = ref<Record<string, boolean>>({ skyblock: false, screenshot: false, session: false, chat: false });
const screenshotExpanded = ref(false);

function scrollChatToBottom() {
  nextTick(() => {
    const el = chatListRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function formatCoins(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
}

watch(() => props.chatEntries.length, () => scrollChatToBottom(), { flush: 'post' });
watch(
  () => [props.modelValue, props.player] as const,
  ([open, player]) => {
    if (!open) {
      command.value = '';
      error.value = '';
      sessionToken.value = null;
      sessionCopied.value = false;
      hypixelStats.value = null;
      hypixelError.value = null;
      skyCryptNetworth.value = null;
      screenshotExpanded.value = false;
    } else {
      scrollChatToBottom();
      if (player) {
        fetchSession();
        if (player.uuid && hasHypixelKey()) fetchHypixel(player.uuid, player.playerName);
        fetchNetworth(player.playerName);
      }
    }
  },
);

async function fetchSession() {
  if (!props.player) return;
  sessionLoading.value = true;
  sessionToken.value = null;
  try {
    const { accessToken } = await getPlayerSession(props.player.playerName);
    sessionToken.value = accessToken;
  } catch {
    sessionToken.value = null;
  } finally {
    sessionLoading.value = false;
  }
}

async function fetchHypixel(uuid: string, playerName?: string) {
  hypixelLoading.value = true;
  hypixelError.value = null;
  hypixelStats.value = null;
  try {
    const stats = await getSkyBlockProfiles(uuid, playerName);
    hypixelStats.value = stats;
    if (!stats && hasHypixelKey()) hypixelError.value = 'No SkyBlock profiles';
  } catch {
    hypixelError.value = 'API error';
  } finally {
    hypixelLoading.value = false;
  }
}

async function fetchNetworth(playerName: string) {
  skyCryptNetworth.value = null;
  try {
    const nw = await getSkyCryptNetworth(playerName);
    skyCryptNetworth.value = nw;
  } catch {
    skyCryptNetworth.value = null;
  }
}

async function copySession() {
  if (!sessionToken.value) return;
  try {
    await navigator.clipboard.writeText(sessionToken.value);
    sessionCopied.value = true;
    setTimeout(() => (sessionCopied.value = false), 2000);
  } catch {
    // ignore
  }
}

function close() {
  emit('update:modelValue', false);
}

function toggleCollapse(key: string) {
  collapsed.value = { ...collapsed.value, [key]: !collapsed.value[key] };
}

async function sendCommand() {
  const cmd = command.value.trim();
  if (!cmd || !props.player || sending.value) return;
  error.value = '';
  sending.value = true;
  try {
    await sendPlayerCommand(props.player.playerName, cmd);
    command.value = '';
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } }; message?: string };
    error.value = err?.response?.data?.message ?? err?.message ?? 'Failed to send';
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="props.modelValue" class="modal-overlay" @click.self="close">
      <div v-if="props.player" class="modal">
        <header class="modal-header">
          <div class="hero">
            <div class="avatar-wrap">
              <span class="avatar-fallback">{{ props.player.playerName.charAt(0).toUpperCase() }}</span>
              <img
                :src="playerSkinUrl(props.player.playerName, 128)"
                :alt="props.player.playerName"
                @error="(e) => { (e.target as HTMLImageElement).style.display = 'none' }"
              />
            </div>
            <div class="hero-info">
              <h1>{{ props.player.playerName }}</h1>
              <div class="meta">
                <span v-if="props.player.area || props.player.subArea" class="location mc-formatted" v-html="parseMcFormat((props.player.area || '?') + (props.player.subArea ? ` · ${props.player.subArea}` : ''))"></span>
                <span v-if="props.player.uuid" class="uuid">{{ props.player.uuid }}</span>
              </div>
              <div class="actions">
                <a
                  :href="skyCryptUrl(props.player.playerName)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="btn btn-skycrypt"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  SkyCrypt
                </a>
              </div>
            </div>
          </div>
          <button class="close-btn" @click="close" aria-label="Close">×</button>
        </header>

        <div class="modal-body">
          <div class="grid-wrap">
          <div class="grid">
            <!-- Stats panel -->
            <section class="panel stats-panel collapsible">
              <h3 class="panel-toggle" @click="toggleCollapse('skyblock')">
                SkyBlock
                <span class="toggle-icon">{{ collapsed.skyblock ? '▶' : '▼' }}</span>
              </h3>
              <div v-show="!collapsed.skyblock" class="panel-content">
              <div v-if="!hasHypixelKey()" class="stats-hint">
                Set VITE_HYPIXEL_API_KEY to load stats
              </div>
              <div v-else-if="hypixelLoading" class="stats-loading">Loading…</div>
              <div v-else-if="hypixelError" class="stats-error">{{ hypixelError }}</div>
              <div v-else-if="hypixelStats" class="stats-content">
                <div class="stats-grid">
                  <div class="stat-card">
                    <span class="stat-label">Purse</span>
                    <span class="stat-value coins">{{ formatCoins(hypixelStats.purse) }}</span>
                    <span v-if="hypixelStats.purse === 0 && (hypixelStats.bank > 0 || hypixelStats.profileName)" class="stat-hint">API access in SkyBlock settings</span>
                  </div>
                  <div class="stat-card">
                    <span class="stat-label">Bank</span>
                    <span class="stat-value coins">{{ formatCoins(hypixelStats.bank) }}</span>
                  </div>
                  <div class="stat-card">
                    <span class="stat-label">Networth</span>
                    <span class="stat-value coins">
                      {{ formatCoins(skyCryptNetworth ?? hypixelStats.purse + hypixelStats.bank) }}
                    </span>
                    <span v-if="skyCryptNetworth == null && (hypixelStats.purse > 0 || hypixelStats.bank > 0)" class="stat-hint">liquid (see SkyCrypt for full)</span>
                  </div>
                  <div class="stat-card">
                    <span class="stat-label">Profile</span>
                    <span class="stat-value">{{ hypixelStats.profileName }}</span>
                  </div>
                  <div v-if="hypixelStats.gameMode" class="stat-card">
                    <span class="stat-label">Mode</span>
                    <span class="stat-value">{{ hypixelStats.gameMode }}</span>
                  </div>
                  <div v-if="hypixelStats.dungeons" class="stat-card">
                    <span class="stat-label">Catacombs</span>
                    <span class="stat-value">Lv {{ hypixelStats.dungeons.level }}</span>
                  </div>
                  <div v-if="hypixelStats.fairySouls != null" class="stat-card">
                    <span class="stat-label">Fairy</span>
                    <span class="stat-value">{{ hypixelStats.fairySouls }}</span>
                  </div>
                </div>
                <div v-if="hypixelStats.skills?.length" class="skills-row">
                  <span class="sub-label">Skills</span>
                  <div class="skills-list">
                    <span v-for="s in hypixelStats.skills" :key="s.name" class="skill-tag">{{ s.name }} {{ s.level }}</span>
                  </div>
                </div>
                <div v-if="hypixelStats.slayers?.length" class="skills-row">
                  <span class="sub-label">Slayers</span>
                  <div class="skills-list">
                    <span v-for="s in hypixelStats.slayers" :key="s.name" class="skill-tag slayer">{{ s.name }} {{ s.level }}</span>
                  </div>
                </div>
              </div>
              </div>
            </section>

            <!-- Screenshot -->
            <section v-if="props.screenshotUrl" class="panel screenshot-panel collapsible full-width">
              <h3 class="panel-toggle" @click="toggleCollapse('screenshot')">
                Live view
                <span class="toggle-icon">{{ collapsed.screenshot ? '▶' : '▼' }}</span>
              </h3>
              <div v-show="!collapsed.screenshot" class="panel-content">
              <div class="screenshot-wrap clickable" @click="screenshotExpanded = true" title="Click to enlarge">
                <img :src="props.screenshotUrl" alt="Game screenshot" class="screenshot-img" />
              </div>
              </div>
            </section>

            <!-- Screenshot lightbox -->
            <Teleport to="body">
              <div v-if="screenshotExpanded && props.screenshotUrl" class="lightbox-overlay" @click.self="screenshotExpanded = false">
                <button class="lightbox-close" @click="screenshotExpanded = false" aria-label="Close">×</button>
                <img :src="props.screenshotUrl" alt="Game screenshot (enlarged)" class="lightbox-img" @click="screenshotExpanded = false" />
              </div>
            </Teleport>

            <!-- Session -->
            <section class="panel session-panel collapsible full-width">
              <h3 class="panel-toggle" @click="toggleCollapse('session')">
                Session (fabric-session-copy)
                <span class="toggle-icon">{{ collapsed.session ? '▶' : '▼' }}</span>
              </h3>
              <div v-show="!collapsed.session" class="panel-content">
              <p class="hint">Copy to paste into fabric-session-copy for quick account switch</p>
              <div v-if="sessionLoading" class="session-loading">Loading…</div>
              <div v-else-if="sessionToken" class="session-box">
                <pre>{{ sessionToken }}</pre>
                <button class="copy-btn" @click="copySession">
                  {{ sessionCopied ? 'Copied!' : 'Copy' }}
                </button>
              </div>
              <div v-else class="session-none">No session captured yet</div>
              </div>
            </section>

            <!-- Chat -->
            <section class="panel chat-panel collapsible full-width">
              <h3 class="panel-toggle" @click="toggleCollapse('chat')">
                Chat transcript
                <span class="toggle-icon">{{ collapsed.chat ? '▶' : '▼' }}</span>
              </h3>
              <div v-show="!collapsed.chat" class="panel-content">
              <div class="chat-list" ref="chatListRef">
                <div
                  v-for="(entry, i) in props.chatEntries"
                  :key="`${entry.timestamp}-${i}`"
                  class="chat-line"
                >
                  <span class="chat-time">{{ new Date(entry.timestamp).toLocaleTimeString() }}</span>
                  <span class="chat-msg mc-formatted" v-html="parseMcFormat(entry.message)"></span>
                </div>
                <p v-if="props.chatEntries.length === 0" class="no-chat">No chat yet</p>
              </div>
              </div>
            </section>
          </div>
          </div>

          <!-- Command runner - pinned to bottom -->
          <div class="command-bar">
            <div class="command-form">
              <input
                v-model="command"
                type="text"
                placeholder="/command or command..."
                maxlength="256"
                @keydown.enter="sendCommand"
              />
              <button @click="sendCommand" :disabled="sending || !command.trim()">
                {{ sending ? '...' : 'Send' }}
              </button>
            </div>
            <p v-if="error" class="command-error">{{ error }}</p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1.5rem;
}
.modal {
  background: linear-gradient(160deg, #0f1117 0%, #13161d 40%, #0c0e12 100%);
  border-radius: 14px;
  width: 100%;
  max-width: 1600px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow:
    0 0 0 1px rgba(120, 140, 160, 0.06),
    0 20px 60px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(120, 140, 160, 0.1);
}
.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 1.5rem 2rem;
  border-bottom: 1px solid rgba(120, 140, 160, 0.08);
}
.hero {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}
.avatar-wrap {
  position: relative;
  width: 88px;
  height: 88px;
  flex-shrink: 0;
  border-radius: 12px;
  overflow: hidden;
  background: #181c22;
  border: 1px solid rgba(100, 180, 140, 0.25);
}
.avatar-wrap img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
}
.avatar-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #1e2a24, #151f1a);
  color: #7dd3a0;
  font-weight: 700;
  font-size: 2rem;
}
.hero-info {
  flex: 1;
  min-width: 0;
}
.hero-info h1 {
  margin: 0 0 0.5rem;
  font-size: 1.75rem;
  font-weight: 600;
  color: #e2e8ed;
  letter-spacing: -0.02em;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}
.location {
  color: #7dd3a0;
}
.uuid {
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
  color: #5c6672;
}
.actions {
  display: flex;
  gap: 0.5rem;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-skycrypt {
  background: rgba(100, 180, 140, 0.12);
  color: #7dd3a0;
  border: 1px solid rgba(100, 180, 140, 0.3);
}
.btn-skycrypt:hover {
  background: rgba(100, 180, 140, 0.2);
  border-color: rgba(100, 180, 140, 0.45);
}
.close-btn {
  background: none;
  border: none;
  color: #5c6672;
  font-size: 1.75rem;
  cursor: pointer;
  line-height: 1;
  padding: 0.25rem;
}
.close-btn:hover {
  color: #9ca8b4;
}
.modal-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.25rem;
}
@media (min-width: 900px) {
  .grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
.panel {
  background: rgba(18, 22, 28, 0.6);
  border: 1px solid rgba(120, 140, 160, 0.08);
  border-radius: 10px;
  padding: 1.25rem;
}
.panel h3 {
  margin: 0 0 1rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #5c6672;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.hint {
  margin: -0.5rem 0 0.75rem;
  font-size: 0.75rem;
  color: #4a5260;
}
.grid-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem 2rem;
}
.grid-wrap::-webkit-scrollbar {
  width: 8px;
}
.grid-wrap::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}
.grid-wrap::-webkit-scrollbar-thumb {
  background: rgba(120, 140, 160, 0.3);
  border-radius: 4px;
}
.grid-wrap::-webkit-scrollbar-thumb:hover {
  background: rgba(120, 140, 160, 0.45);
}
.grid-wrap {
  scrollbar-width: thin;
  scrollbar-color: rgba(120, 140, 160, 0.35) rgba(0, 0, 0, 0.2);
}
.stats-panel { grid-column: span 1; }
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}
.stat-card {
  background: rgba(10, 14, 18, 0.5);
  border: 1px solid rgba(120, 140, 160, 0.06);
  border-radius: 8px;
  padding: 0.75rem 1rem;
}
.stat-label {
  display: block;
  font-size: 0.7rem;
  color: #5c6672;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.stat-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: #c8d4dc;
}
.stat-value.coins {
  color: #7dd3a0;
}
.stat-hint {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.65rem;
  color: #4a5260;
}
.stats-hint,
.stats-loading,
.stats-error {
  font-size: 0.85rem;
  color: #5c6672;
  font-style: italic;
}
.stats-error { color: #e07a7a; }
.skills-row {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(120, 140, 160, 0.06);
}
.sub-label {
  display: block;
  font-size: 0.65rem;
  color: #4a5260;
  text-transform: uppercase;
  margin-bottom: 0.35rem;
}
.skills-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.skill-tag {
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  background: rgba(100, 180, 140, 0.1);
  border-radius: 4px;
  color: #7dd3a0;
}
.skill-tag.slayer {
  background: rgba(180, 100, 140, 0.12);
  color: #d39ab8;
}
.screenshot-wrap {
  border-radius: 8px;
  overflow: hidden;
  background: #0c0e12;
  border: 1px solid rgba(120, 140, 160, 0.06);
}
.screenshot-wrap.clickable {
  cursor: pointer;
}
.screenshot-wrap.clickable:hover {
  border-color: rgba(100, 180, 140, 0.25);
  box-shadow: 0 0 0 1px rgba(100, 180, 140, 0.1);
}
.screenshot-img {
  display: block;
  width: 100%;
  max-height: 320px;
  object-fit: contain;
}
.lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 0.75rem;
}
.lightbox-close {
  position: absolute;
  top: 1rem;
  right: 1.5rem;
  background: none;
  border: none;
  color: #9ca8b4;
  font-size: 2rem;
  cursor: pointer;
  line-height: 1;
  z-index: 1;
}
.lightbox-close:hover {
  color: #fff;
}
.lightbox-img {
  max-width: 98vw;
  max-height: 96vh;
  object-fit: contain;
  border-radius: 8px;
}
.session-box {
  width: 100%;
  box-sizing: border-box;
  background: #0c0e12;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid rgba(120, 140, 160, 0.08);
}
.session-box pre {
  margin: 0;
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
  color: #7dd3a0;
  word-break: break-all;
  white-space: pre-wrap;
  max-height: 100px;
  overflow-y: auto;
  width: 100%;
  box-sizing: border-box;
}
.session-box pre::-webkit-scrollbar { width: 6px; }
.session-box pre::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 3px; }
.session-box pre::-webkit-scrollbar-thumb { background: rgba(120,140,160,0.3); border-radius: 3px; }
.session-box .copy-btn {
  margin-top: 0.75rem;
  padding: 0.4rem 1rem;
  font-size: 0.8rem;
  border: 1px solid rgba(100, 180, 140, 0.25);
  border-radius: 6px;
  background: rgba(100, 180, 140, 0.1);
  color: #7dd3a0;
  cursor: pointer;
}
.session-box .copy-btn:hover {
  background: rgba(100, 180, 140, 0.18);
}
.session-loading,
.session-none {
  font-size: 0.9rem;
  color: #5c6672;
  font-style: italic;
}
.chat-panel {
  min-width: 420px;
}
.chat-list {
  background: #0c0e12;
  border-radius: 8px;
  padding: 1rem;
  max-height: 320px;
  overflow-y: auto;
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
  border: 1px solid rgba(120, 140, 160, 0.06);
  width: 100%;
  box-sizing: border-box;
}
.chat-list::-webkit-scrollbar { width: 6px; }
.chat-list::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 3px; }
.chat-list::-webkit-scrollbar-thumb { background: rgba(120,140,160,0.3); border-radius: 3px; }
.chat-line {
  display: flex;
  gap: 1rem;
  margin-bottom: 0.4rem;
  word-break: break-word;
}
.chat-time {
  flex-shrink: 0;
  color: #4a5260;
}
.chat-msg {
  color: #9ca8b4;
}
.no-chat {
  margin: 0;
  color: #4a5260;
  font-style: italic;
}

/* Command bar - pinned at bottom */
.command-bar {
  flex-shrink: 0;
  padding: 1rem 2rem 1.25rem;
  background: rgba(12, 16, 22, 0.95);
  border-top: 1px solid rgba(120, 140, 160, 0.12);
}
.command-form {
  display: flex;
  gap: 0.75rem;
}
.command-form input {
  flex: 1;
  padding: 0.65rem 1rem;
  border: 1px solid rgba(120, 140, 160, 0.15);
  border-radius: 8px;
  background: rgba(12, 16, 20, 0.8);
  color: #e2e8ed;
  font-size: 0.95rem;
}
.command-form input:focus {
  outline: none;
  border-color: rgba(100, 180, 140, 0.4);
}
.command-form input::placeholder {
  color: #4a5260;
}
.command-form button {
  padding: 0.65rem 1.25rem;
  border: 1px solid rgba(100, 180, 140, 0.4);
  border-radius: 8px;
  background: rgba(100, 180, 140, 0.12);
  color: #7dd3a0;
  cursor: pointer;
  font-weight: 500;
}
.command-form button:hover:not(:disabled) {
  background: rgba(100, 180, 140, 0.22);
}
.command-form button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.command-error {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  color: #e07a7a;
}
</style>
