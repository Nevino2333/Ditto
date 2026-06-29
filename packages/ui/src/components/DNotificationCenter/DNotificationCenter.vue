<script setup lang="ts">
import { computed } from 'vue';
import { useNotificationStore } from '@ditto/services';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (e: 'close'): void;
}>();

const store = useNotificationStore();

const recent = computed(() => store.recent);
const unreadCount = computed(() => store.unreadCount);

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + ' 分钟前';
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + ' 小时前';
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function onNotificationClick(id: string) {
  store.markAsRead(id);
}

function onOverlayClick() {
  emit('close');
}

function onMarkAllRead() {
  store.markAllAsRead();
}

function onClearAll() {
  store.clearAll();
}
</script>

<template>
  <Teleport to="body">
    <Transition name="d-nc-overlay">
      <div v-if="visible" class="d-nc-overlay" @click="onOverlayClick" role="presentation" />
    </Transition>
    <Transition name="d-nc-panel">
      <aside
        v-if="visible"
        class="d-nc"
        role="dialog"
        aria-modal="false"
        aria-label="通知中心"
      >
        <header class="d-nc__header">
          <div class="d-nc__title">
            <span>通知</span>
            <span v-if="unreadCount > 0" class="d-nc__badge">{{ unreadCount }}</span>
          </div>
          <div class="d-nc__actions">
            <button class="d-nc__btn" @click="onMarkAllRead" title="全部已读" aria-label="全部标记为已读">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8l3 3 7-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="d-nc__btn" @click="onClearAll" title="清空全部" aria-label="清空所有通知">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              </svg>
            </button>
            <button class="d-nc__btn d-nc__btn--close" @click="onOverlayClick" title="关闭" aria-label="关闭通知中心">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </header>

        <div class="d-nc__list">
          <div v-if="recent.length === 0" class="d-nc__empty">
            <span class="d-nc__empty-icon">🔔</span>
            <span class="d-nc__empty-text">暂无通知</span>
          </div>
          <article
            v-for="n in recent"
            :key="n.id"
            class="d-nc__item"
            :class="{ 'd-nc__item--unread': !n.read, ['d-nc__item--' + (n.type || 'info')]: true }"
            @click="onNotificationClick(n.id)"
          >
            <span v-if="n.icon" class="d-nc__item-icon">{{ n.icon }}</span>
            <div v-else class="d-nc__item-icon d-nc__item-icon--fallback">{{ (n.source || 'i').charAt(0).toUpperCase() }}</div>
            <div class="d-nc__item-body">
              <div class="d-nc__item-header">
                <span class="d-nc__item-title">{{ n.title }}</span>
                <span class="d-nc__item-time">{{ formatTime(n.timestamp) }}</span>
              </div>
              <p v-if="n.body" class="d-nc__item-text">{{ n.body }}</p>
              <span class="d-nc__item-source">{{ n.source }}</span>
            </div>
            <span v-if="!n.read" class="d-nc__item-dot" aria-label="未读" />
          </article>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.d-nc-overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 9500;
  background: rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.d-nc {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 380px;
  max-width: 90vw;
  z-index: 9501;
  background: var(--ditto-color-surface-overlay, #ffffff);
  box-shadow: var(--ditto-shadow-dropdown, -8px 0 32px rgba(0, 0, 0, 0.1));
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--ditto-color-border-subtle, rgba(0, 0, 0, 0.06));
}

.d-nc__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  flex-shrink: 0;
}

.d-nc__title {
  display: flex;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
  color: var(--ditto-color-text-primary, #0f172a);
}

.d-nc__title > span:first-child {
  margin-right: 8px;
}

.d-nc__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--ditto-color-primary-500, #3b82f6);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}

.d-nc__actions {
  display: flex;
  align-items: center;
}

.d-nc__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ditto-color-text-secondary, #64748b);
  cursor: pointer;
  margin-left: 2px;
  transition: background 120ms, color 120ms;
}

.d-nc__btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--ditto-color-text-primary, #0f172a);
}

.d-nc__list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.d-nc__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  color: var(--ditto-color-text-disabled, #94a3b8);
}

.d-nc__empty-icon {
  font-size: 40px;
  margin-bottom: 8px;
  opacity: 0.5;
}

.d-nc__empty-text {
  font-size: 13px;
}

.d-nc__item {
  display: flex;
  align-items: flex-start;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 100ms;
  position: relative;
  margin-bottom: 4px;
}

.d-nc__item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.d-nc__item--unread {
  background: var(--ditto-color-primary-50, rgba(59, 130, 246, 0.06));
}

.d-nc__item--unread:hover {
  background: var(--ditto-color-primary-100, rgba(59, 130, 246, 0.12));
}

.d-nc__item-icon {
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
  margin-right: 12px;
  margin-top: 2px;
}

.d-nc__item-icon--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--ditto-color-primary-100, #dbeafe);
  color: var(--ditto-color-primary-600, #2563eb);
  font-size: 13px;
  font-weight: 600;
  margin-top: 0;
}

.d-nc__item-body {
  flex: 1;
  min-width: 0;
}

.d-nc__item-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 2px;
}

.d-nc__item-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ditto-color-text-primary, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 8px;
}

.d-nc__item-time {
  font-size: 11px;
  color: var(--ditto-color-text-disabled, #94a3b8);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.d-nc__item-text {
  margin: 0 0 4px 0;
  font-size: 12px;
  color: var(--ditto-color-text-secondary, #475569);
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.d-nc__item-source {
  font-size: 10px;
  color: var(--ditto-color-text-disabled, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.d-nc__item-dot {
  position: absolute;
  top: 16px;
  right: 12px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ditto-color-primary-500, #3b82f6);
}

/* 类型色条 */
.d-nc__item--info::before,
.d-nc__item--success::before,
.d-nc__item--warning::before,
.d-nc__item--error::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 3px;
  border-radius: 0 2px 2px 0;
}

.d-nc__item--info::before { background: var(--ditto-color-semantic-info, #3b82f6); }
.d-nc__item--success::before { background: var(--ditto-color-semantic-success, #22c55e); }
.d-nc__item--warning::before { background: var(--ditto-color-semantic-warning, #f59e0b); }
.d-nc__item--error::before { background: var(--ditto-color-semantic-error, #ef4444); }

/* 遮罩淡入 */
.d-nc-overlay-enter-active,
.d-nc-overlay-leave-active {
  transition: opacity 200ms ease;
}
.d-nc-overlay-enter-from,
.d-nc-overlay-leave-to {
  opacity: 0;
}

/* 面板从右侧滑入 */
.d-nc-panel-enter-active,
.d-nc-panel-leave-active {
  transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
.d-nc-panel-enter-from,
.d-nc-panel-leave-to {
  transform: translateX(100%);
}

@media (max-width: 768px) {
  .d-nc {
    width: 100vw;
    max-width: 100vw;
  }

  .d-nc__header {
    padding: 14px 16px;
  }

  .d-nc__btn {
    width: 40px;
    height: 40px;
  }
}

/* 尊重减少动画偏好 */
@media (prefers-reduced-motion: reduce) {
  .d-nc-panel-enter-active,
  .d-nc-panel-leave-active,
  .d-nc-overlay-enter-active,
  .d-nc-overlay-leave-active {
    transition-duration: 0.01ms;
  }
}
</style>
