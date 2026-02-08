<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { sendPlayerCommand } from '@/api/ably';
import type { PlayerData, ChatEntry } from '@/api/ably';
import { playerSkinUrl } from '@/utils/minecraft';

const props = defineProps<{
  player: PlayerData | null;
  chatEntries: ChatEntry[];
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
}>();

const command = ref('');
const sending = ref(false);
const error = ref('');
const chatListRef = ref<HTMLElement | null>(null);

function scrollChatToBottom() {
  nextTick(() => {
    const el = chatListRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

watch(() => props.chatEntries.length, () => scrollChatToBottom(), { flush: 'post' });
watch(() => props.modelValue, (v) => {
  if (!v) {
    command.value = '';
    error.value = '';
  } else {
    scrollChatToBottom();
  }
});

function close() {
  emit('update:modelValue', false);
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
    <div v-if="modelValue" class="modal-overlay" @click.self="close">
      <div class="modal" v-if="player">
        <div class="modal-header">
          <div class="modal-player">
            <div class="modal-avatar">
              <span class="avatar-fallback">{{ player.playerName.charAt(0).toUpperCase() }}</span>
              <img :src="playerSkinUrl(player.playerName, 64)" :alt="player.playerName" @error="(e) => { (e.target as HTMLImageElement).style.display = 'none' }" />
            </div>
            <h2>{{ player.playerName }}</h2>
          </div>
          <button class="close-btn" @click="close">×</button>
        </div>

        <div class="modal-body">
          <section class="info-section">
            <h3>Location</h3>
            <p class="location">
              <span v-if="player.area || player.subArea">
                {{ player.area || '?' }}{{ player.subArea ? ` · ${player.subArea}` : '' }}
              </span>
              <span v-else class="faint">—</span>
            </p>
            <p v-if="player.uuid" class="uuid">{{ player.uuid }}</p>
          </section>

          <section class="chat-section">
            <h3>Chat transcript</h3>
            <div class="chat-list" ref="chatListRef">
              <div
                v-for="(entry, i) in chatEntries"
                :key="`${entry.timestamp}-${i}`"
                class="chat-line"
              >
                <span class="chat-time">{{ new Date(entry.timestamp).toLocaleTimeString() }}</span>
                <span class="chat-msg">{{ entry.message }}</span>
              </div>
              <p v-if="chatEntries.length === 0" class="no-chat">No chat yet</p>
            </div>
          </section>

          <section class="command-section">
            <h3>Run command as player</h3>
            <p class="hint">Executes in their game (e.g. /party invite, /msg ...)</p>
            <div class="command-form">
              <input
                v-model="command"
                type="text"
                placeholder="/command or command..."
                maxlength="256"
                @keydown.enter="sendCommand"
              />
              <button @click="sendCommand" :disabled="sending || !command.trim()">
                {{ sending ? 'Sending...' : 'Send' }}
              </button>
            </div>
            <p v-if="error" class="command-error">{{ error }}</p>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: #1a1a2e;
  border-radius: 12px;
  max-width: 560px;
  width: 95%;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  border: 1px solid #333;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #333;
}
.modal-player {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.modal-avatar {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  background: #1a1a2e;
}
.modal-avatar img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
}
.modal-avatar .avatar-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #333;
  color: #8a8;
  font-weight: 600;
  font-size: 1.25rem;
}
.modal-header h2 {
  margin: 0;
  font-size: 1.1rem;
  color: #eee;
}
.close-btn {
  background: none;
  border: none;
  color: #888;
  font-size: 1.5rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 0.25rem;
}
.close-btn:hover {
  color: #fff;
}
.modal-body {
  padding: 1.25rem;
  overflow-y: auto;
}
.modal-body h3 {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  color: #888;
  text-transform: uppercase;
}
.info-section {
  margin-bottom: 1.25rem;
}
.location {
  margin: 0;
  color: #8a8;
  font-size: 0.95rem;
}
.uuid {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: #666;
  font-family: monospace;
}
.faint {
  color: #666;
}
.chat-section {
  margin-bottom: 1.25rem;
}
.chat-list {
  background: #0d0d14;
  border-radius: 8px;
  padding: 0.75rem;
  max-height: 240px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 0.8rem;
}
.chat-line {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.35rem;
  word-break: break-word;
}
.chat-time {
  flex-shrink: 0;
  color: #666;
}
.chat-msg {
  color: #ccc;
}
.no-chat {
  margin: 0;
  color: #666;
  font-style: italic;
}
.command-form {
  display: flex;
  gap: 0.5rem;
}
.command-form input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid #444;
  border-radius: 4px;
  background: #2a2a3e;
  color: #eee;
  font-size: 0.9rem;
}
.command-form input:focus {
  outline: none;
  border-color: #6ec96e;
}
.command-form button {
  padding: 0.5rem 1rem;
  border: 1px solid #6ec96e;
  border-radius: 4px;
  background: #1a3a2a;
  color: #6ec96e;
  cursor: pointer;
  white-space: nowrap;
}
.command-form button:hover:not(:disabled) {
  background: #2a4a3a;
}
.command-form button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.hint {
  margin: -0.25rem 0 0.5rem;
  font-size: 0.75rem;
  color: #666;
}
.command-error {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  color: #e88;
}
</style>
