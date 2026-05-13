<script setup lang="ts">
import { watch, onUnmounted } from 'vue';
import { useNotificationStore } from '@ditto/services';
import type { NotificationEntry } from '@ditto/services';

const store = useNotificationStore();

const autoDismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

const DEFAULT_DURATION = 5000;

function scheduleAutoDismiss(id: string) {
  if (autoDismissTimers.has(id)) return;
  const timer = setTimeout(() => {
    store.dismissNotification(id);
    autoDismissTimers.delete(id);
  }, DEFAULT_DURATION);
  autoDismissTimers.set(id, timer);
}

function cancelAutoDismiss(id: string) {
  const timer = autoDismissTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    autoDismissTimers.delete(id);
  }
}

watch(
  () => store.notifications.length,
  (newLen, oldLen) => {
    if (oldLen !== undefined && newLen > oldLen) {
      const current = store.notifications;
      const added = current.slice(0, newLen - oldLen);
      for (const notif of added) {
        if (!notif.persistent) {
          scheduleAutoDismiss(notif.id);
        }
      }
    }
  },
  { immediate: true }
);

watch(
  () => store.notifications.map((n) => n.id),
  (newIds, oldIds) => {
    if (oldIds) {
      const removed = oldIds.filter((id) => !newIds.includes(id));
      for (const id of removed) {
        cancelAutoDismiss(id);
      }
    }
  }
);

onUnmounted(() => {
  for (const timer of autoDismissTimers.values()) {
    clearTimeout(timer);
  }
  autoDismissTimers.clear();
});

function onDismiss(id: string) {
  cancelAutoDismiss(id);
  store.dismissNotification(id);
}
</script>

<template>
  <Teleport to="body">
    <div class="d-notification-container">
      <TransitionGroup name="d-notification">
        <div
          v-for="notif in store.notifications"
          :key="notif.id"
          class="d-notification"
          :class="`d-notification--${notif.type || 'info'}`"
          @click="onDismiss(notif.id)"
        >
          <span v-if="notif.icon" class="d-notification__icon">{{ notif.icon }}</span>
          <div class="d-notification__content">
            <span class="d-notification__title">{{ notif.title }}</span>
            <span class="d-notification__body">{{ notif.body }}</span>
          </div>
          <button class="d-notification__close" @click.stop="onDismiss(notif.id)">×</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.d-notification-container {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  max-width: 360px;
}

.d-notification {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: var(--ditto-color-surface-overlay, #fff);
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  pointer-events: auto;
  cursor: pointer;
  transition: opacity 200ms, transform 200ms;
}

.d-notification--info { border-left: 3px solid var(--ditto-color-semantic-info, #3b82f6); }
.d-notification--success { border-left: 3px solid var(--ditto-color-semantic-success, #22c55e); }
.d-notification--warning { border-left: 3px solid var(--ditto-color-semantic-warning, #f59e0b); }
.d-notification--error { border-left: 3px solid var(--ditto-color-semantic-error, #ef4444); }

.d-notification__icon {
  font-size: 20px;
  line-height: 1;
  flex-shrink: 0;
}

.d-notification__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.d-notification__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ditto-color-text-primary, #0f172a);
}

.d-notification__body {
  font-size: 12px;
  color: var(--ditto-color-text-secondary, #475569);
}

.d-notification__close {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--ditto-color-text-disabled, #94a3b8);
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  flex-shrink: 0;
}

.d-notification__close:hover {
  color: var(--ditto-color-text-primary, #0f172a);
}

.d-notification-enter-active {
  animation: d-notif-in 250ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.d-notification-leave-active {
  animation: d-notif-out 200ms ease-in;
}

@keyframes d-notif-in {
  from { opacity: 0; transform: translateX(40px) scale(0.95); }
  to { opacity: 1; transform: translateX(0) scale(1); }
}

@keyframes d-notif-out {
  from { opacity: 1; transform: translateX(0); }
  to { opacity: 0; transform: translateX(40px); }
}
</style>
