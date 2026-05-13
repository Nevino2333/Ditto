<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';

interface ChatMsg {
  id: string;
  userId: string;
  username: string;
  content: string;
  timestamp: number;
}

const messages = ref<ChatMsg[]>([]);
const inputText = ref('');
const username = ref(`User-${Math.floor(Math.random() * 1000)}`);
const connected = ref(false);
const messagesContainer = ref<HTMLElement | null>(null);
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const serverUrl = 'ws://localhost:3001/ws';

function connect() {
  if (ws) return;

  ws = new WebSocket(serverUrl);

  ws.onopen = () => {
    connected.value = true;
    ws?.send(JSON.stringify({ type: 'auth', userId: username.value, username: username.value }));
    ws?.send(JSON.stringify({ type: 'join', channel: 'general' }));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'chat') {
      messages.value.push(data.message);
      nextTick(() => scrollToBottom());
    }
    if (data.type === 'history') {
      messages.value = data.messages;
      nextTick(() => scrollToBottom());
    }
  };

  ws.onclose = () => {
    connected.value = false;
    ws = null;
    reconnectTimer = setTimeout(connect, 3000);
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function disconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  ws?.close();
  ws = null;
  connected.value = false;
}

function sendMessage() {
  if (!inputText.value.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: 'chat',
    channel: 'general',
    content: inputText.value.trim(),
  }));
  inputText.value = '';
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

onMounted(() => connect());
onUnmounted(() => disconnect());
</script>

<template>
  <div class="chat-app">
    <div class="chat-app__header">
      <span class="chat-app__title">💬 聊天室</span>
      <span class="chat-app__status" :class="{ 'chat-app__status--online': connected }">
        {{ connected ? '在线' : '离线' }}
      </span>
    </div>
    <div ref="messagesContainer" class="chat-app__messages">
      <div v-if="messages.length === 0" class="chat-app__empty">
        暂无消息，发送第一条消息吧！
      </div>
      <div v-for="msg in messages" :key="msg.id" class="chat-msg">
        <span class="chat-msg__user">{{ msg.username }}</span>
        <span class="chat-msg__time">{{ formatTime(msg.timestamp) }}</span>
        <div class="chat-msg__content">{{ msg.content }}</div>
      </div>
    </div>
    <div class="chat-app__input">
      <input
        v-model="inputText"
        @keyup.enter="sendMessage"
        placeholder="输入消息..."
        :disabled="!connected"
        class="chat-app__input-field"
      />
      <button @click="sendMessage" :disabled="!connected || !inputText.trim()" class="chat-app__send-btn">
        发送
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-app__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  background: var(--ditto-color-surface-raised, #f8fafc);
}

.chat-app__title {
  font-size: 13px;
  font-weight: 600;
}

.chat-app__status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: #fee2e2;
  color: #ef4444;
}

.chat-app__status--online {
  background: #dcfce7;
  color: #22c55e;
}

.chat-app__messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-app__empty {
  text-align: center;
  color: var(--ditto-color-text-disabled, #94a3b8);
  padding: 24px;
  font-size: 13px;
}

.chat-msg {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
}

.chat-msg__user {
  font-size: 12px;
  font-weight: 600;
  color: var(--ditto-color-primary-500, #3b82f6);
}

.chat-msg__time {
  font-size: 10px;
  color: var(--ditto-color-text-disabled, #94a3b8);
  align-self: center;
}

.chat-msg__content {
  width: 100%;
  font-size: 13px;
  color: var(--ditto-color-text-primary, #0f172a);
  line-height: 1.5;
  word-break: break-word;
}

.chat-app__input {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
}

.chat-app__input-field {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 6px;
  font-size: 13px;
  background: var(--ditto-color-surface-base, #fff);
  color: var(--ditto-color-text-primary, #0f172a);
  outline: none;
}

.chat-app__input-field:focus {
  border-color: var(--ditto-color-primary-500, #3b82f6);
}

.chat-app__send-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: var(--ditto-color-primary-500, #3b82f6);
  color: white;
  font-size: 13px;
  cursor: pointer;
  transition: background 120ms;
}

.chat-app__send-btn:hover:not(:disabled) {
  background: var(--ditto-color-primary-600, #2563eb);
}

.chat-app__send-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
