<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { usePowerStore } from '@ditto/services';
import { DIcon } from '../DIcon';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (e: 'unlock'): void;
}>();

const powerStore = usePowerStore();
const password = ref('');
const error = ref('');
const now = ref(Date.now());
const inputRef = ref<HTMLInputElement | null>(null);
const unlocking = ref(false);

let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  timer = setInterval(() => { now.value = Date.now(); }, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

// 显示时自动聚焦输入框
watch(() => props.visible, async (val) => {
  if (val) {
    password.value = '';
    error.value = '';
    await nextTick();
    if (inputRef.value) inputRef.value.focus();
  }
});

const formattedTime = computed(() => {
  const d = new Date(now.value);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
});

const formattedDate = computed(() => {
  const d = new Date(now.value);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`;
});

function onUnlock() {
  if (unlocking.value) return;
  // PWA 场景：锁屏仅是视觉阻挡，不强制密码（任何非空输入或直接回车都解锁）
  // 真实密码校验由宿主环境（如 Kiosk）注入 usePowerStore.unlock 装饰实现
  unlocking.value = true;
  setTimeout(() => {
    powerStore.unlock();
    password.value = '';
    error.value = '';
    unlocking.value = false;
    emit('unlock');
  }, 220);
}

function onKeydown(e: KeyboardEvent) {
  if (!props.visible) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    onUnlock();
  }
}

// 锁屏覆盖 Escape：不响应（防止误触解锁）
</script>

<template>
  <Teleport to="body">
    <Transition name="d-lock">
      <div
        v-if="visible"
        class="d-lock"
        role="dialog"
        aria-modal="true"
        aria-label="锁屏"
        @keydown="onKeydown"
      >
        <div class="d-lock__clock">
          <div class="d-lock__time">{{ formattedTime }}</div>
          <div class="d-lock__date">{{ formattedDate }}</div>
        </div>

        <div class="d-lock__panel">
          <DIcon name="fa-solid fa-user" class="d-lock__avatar" />
          <div class="d-lock__hint">已锁定</div>
          <input
            ref="inputRef"
            v-model="password"
            type="password"
            class="d-lock__input"
            placeholder="按回车键解锁"
            :disabled="unlocking"
            autocomplete="off"
            @keydown="onKeydown"
          />
          <button
            class="d-lock__btn"
            :disabled="unlocking"
            @click="onUnlock"
          >
            <span v-if="!unlocking">解锁</span>
            <span v-else class="d-lock__spinner" aria-label="解锁中">…</span>
          </button>
          <p v-if="error" class="d-lock__error">{{ error }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.d-lock {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 9990;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, #0f172a 0%, #1e293b 60%, #0f172a 100%);
  color: #fff;
  user-select: none;
  -webkit-user-select: none;
}

/* 模糊背景层（增强隐私感） */
.d-lock::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image:
    radial-gradient(circle at 20% 30%, rgba(96, 165, 250, 0.15), transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(168, 85, 247, 0.12), transparent 50%);
  pointer-events: none;
}

.d-lock__clock {
  text-align: center;
  margin-bottom: 60px;
  z-index: 1;
}

.d-lock__time {
  font-size: 96px;
  font-weight: 200;
  letter-spacing: -4px;
  line-height: 1;
  text-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  font-variant-numeric: tabular-nums;
}

.d-lock__date {
  margin-top: 12px;
  font-size: 16px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.7);
  letter-spacing: 0.5px;
}

.d-lock__panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 1;
}

.d-lock__avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  border: 2px solid rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  margin-bottom: 16px;
}

.d-lock__hint {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 16px;
}

.d-lock__input {
  width: 240px;
  height: 40px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 14px;
  outline: none;
  text-align: center;
  letter-spacing: 2px;
  transition: border-color 150ms, background 150ms;
  box-sizing: border-box;
}

.d-lock__input:focus {
  border-color: rgba(96, 165, 250, 0.6);
  background: rgba(96, 165, 250, 0.1);
}

.d-lock__input::placeholder {
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 0;
}

.d-lock__btn {
  margin-top: 12px;
  width: 240px;
  height: 38px;
  border: none;
  border-radius: 8px;
  background: var(--ditto-color-primary-500, #3b82f6);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms, transform 80ms, opacity 120ms;
}

.d-lock__btn:hover:not(:disabled) {
  background: var(--ditto-color-primary-600, #2563eb);
}

.d-lock__btn:active:not(:disabled) {
  transform: scale(0.97);
}

.d-lock__btn:disabled {
  opacity: 0.7;
  cursor: default;
}

.d-lock__error {
  margin-top: 8px;
  font-size: 12px;
  color: var(--ditto-color-semantic-error, #ef4444);
}

.d-lock__spinner {
  display: inline-block;
}

/* 入场动画 */
.d-lock-enter-active {
  transition: opacity 320ms ease;
}
.d-lock-enter-active .d-lock__clock,
.d-lock-enter-active .d-lock__panel {
  transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 320ms ease;
}

.d-lock-enter-from {
  opacity: 0;
}
.d-lock-enter-from .d-lock__clock {
  transform: translateY(-20px);
  opacity: 0;
}
.d-lock-enter-from .d-lock__panel {
  transform: translateY(20px);
  opacity: 0;
}

.d-lock-leave-active {
  transition: opacity 240ms ease;
}
.d-lock-leave-to {
  opacity: 0;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .d-lock__time {
    font-size: 72px;
    letter-spacing: -3px;
  }

  .d-lock__date {
    font-size: 14px;
  }

  .d-lock__clock {
    margin-bottom: 40px;
  }

  .d-lock__avatar {
    width: 64px;
    height: 64px;
    font-size: 32px;
  }
}

@media (max-width: 480px) {
  .d-lock__time {
    font-size: 56px;
  }
}

/* 高对比度 */
@media (prefers-contrast: high) {
  .d-lock {
    background: #000;
  }

  .d-lock__input {
    border-color: rgba(255, 255, 255, 0.6);
  }
}

/* 尊重减少动画偏好 */
@media (prefers-reduced-motion: reduce) {
  .d-lock-enter-active,
  .d-lock-leave-active,
  .d-lock-enter-active .d-lock__clock,
  .d-lock-enter-active .d-lock__panel {
    transition-duration: 0.01ms;
  }
}
</style>
