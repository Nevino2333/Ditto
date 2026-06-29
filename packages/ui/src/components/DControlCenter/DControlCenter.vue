<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { usePowerStore } from '@ditto/services';
import { getThemeEngine } from '@ditto/theme';
import { DIcon } from '../DIcon';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (e: 'close'): void;
}>();

const powerStore = usePowerStore();
const themeEngine = getThemeEngine();

// 本地 UI 状态（控制中心是临时面板，状态保留在 store 中持久化由 Settings 负责）
const brightness = ref(80);
const volume = ref(60);
const dnd = ref(false); // 勿扰
const scheme = computed<'light' | 'dark'>(() => themeEngine.getColorScheme());

// 通知静音：勿扰开启时不显示桌面通知（由 notification 组件读 store 判断；此处只持久化到 localStorage）
watch(dnd, (val) => {
  try { localStorage.setItem('ditto:dnd', val ? '1' : '0'); } catch { /* ignore */ }
});

onMounted(() => {
  try {
    dnd.value = localStorage.getItem('ditto:dnd') === '1';
    const b = localStorage.getItem('ditto:brightness');
    const v = localStorage.getItem('ditto:volume');
    if (b) brightness.value = Number(b);
    if (v) volume.value = Number(v);
  } catch { /* ignore */ }
});

watch(brightness, (val) => {
  try { localStorage.setItem('ditto:brightness', String(val)); } catch { /* ignore */ }
});

watch(volume, (val) => {
  try { localStorage.setItem('ditto:volume', String(val)); } catch { /* ignore */ }
});

function setScheme(s: 'light' | 'dark') {
  if (scheme.value !== s) themeEngine.toggleColorScheme();
}

function toggleDnd() {
  dnd.value = !dnd.value;
}

function onOverlayClick() {
  emit('close');
}

function onPower(action: 'sleep' | 'shutdown' | 'restart' | 'logout' | 'lock') {
  // 关闭面板后由 Shell watch powerStore.lastEvent 执行副作用
  switch (action) {
    case 'sleep': void powerStore.sleep(); break;
    case 'shutdown': powerStore.shutdown(); break;
    case 'restart': powerStore.restart(); break;
    case 'logout': powerStore.logout(); break;
    case 'lock': powerStore.lock(); break;
  }
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <Transition name="d-cc-overlay">
      <div v-if="visible" class="d-cc-overlay" @click="onOverlayClick" role="presentation" />
    </Transition>
    <Transition name="d-cc-panel">
      <aside
        v-if="visible"
        class="d-cc"
        role="dialog"
        aria-modal="false"
        aria-label="控制中心"
      >
        <header class="d-cc__header">
          <span class="d-cc__title">控制中心</span>
          <button class="d-cc__btn d-cc__btn--close" @click="onOverlayClick" title="关闭" aria-label="关闭控制中心">
            <DIcon name="fa-solid fa-xmark" />
          </button>
        </header>

        <div class="d-cc__body">
          <!-- 主题与勿扰：紧凑切换按钮组 -->
          <section class="d-cc__group">
            <button
              class="d-cc__tile"
              :class="{ 'd-cc__tile--active': scheme === 'light' }"
              @click="setScheme('light')"
              title="浅色模式"
            >
              <DIcon name="fa-solid fa-sun" class="d-cc__tile-icon" />
              <span class="d-cc__tile-label">浅色</span>
            </button>
            <button
              class="d-cc__tile"
              :class="{ 'd-cc__tile--active': scheme === 'dark' }"
              @click="setScheme('dark')"
              title="深色模式"
            >
              <DIcon name="fa-solid fa-moon" class="d-cc__tile-icon" />
              <span class="d-cc__tile-label">深色</span>
            </button>
            <button
              class="d-cc__tile"
              :class="{ 'd-cc__tile--active': dnd }"
              @click="toggleDnd"
              :title="dnd ? '关闭勿扰' : '开启勿扰'"
            >
              <DIcon name="fa-solid fa-bell-slash" class="d-cc__tile-icon" />
              <span class="d-cc__tile-label">勿扰</span>
            </button>
          </section>

          <!-- 滑块组：亮度、音量 -->
          <section class="d-cc__sliders">
            <div class="d-cc__slider-row">
              <DIcon name="fa-solid fa-sun" class="d-cc__slider-icon" />
              <input
                v-model.number="brightness"
                type="range"
                min="10"
                max="100"
                step="1"
                class="d-cc__slider"
                aria-label="亮度"
              />
              <span class="d-cc__slider-value">{{ brightness }}</span>
            </div>
            <div class="d-cc__slider-row">
              <DIcon name="fa-solid fa-volume-high" class="d-cc__slider-icon" />
              <input
                v-model.number="volume"
                type="range"
                min="0"
                max="100"
                step="1"
                class="d-cc__slider"
                aria-label="音量"
              />
              <span class="d-cc__slider-value">{{ volume }}</span>
            </div>
          </section>

          <!-- 电源按钮区 -->
          <section class="d-cc__power">
            <button class="d-cc__power-btn" @click="onPower('lock')" title="锁屏">
              <DIcon name="fa-solid fa-lock" class="d-cc__power-icon" />
              <span class="d-cc__power-label">锁屏</span>
            </button>
            <button class="d-cc__power-btn" @click="onPower('sleep')" title="睡眠">
              <DIcon name="fa-solid fa-moon" class="d-cc__power-icon" />
              <span class="d-cc__power-label">睡眠</span>
            </button>
            <button class="d-cc__power-btn" @click="onPower('logout')" title="注销">
              <DIcon name="fa-solid fa-arrow-right-from-bracket" class="d-cc__power-icon" />
              <span class="d-cc__power-label">注销</span>
            </button>
            <button class="d-cc__power-btn" @click="onPower('restart')" title="重启">
              <DIcon name="fa-solid fa-rotate" class="d-cc__power-icon" />
              <span class="d-cc__power-label">重启</span>
            </button>
            <button class="d-cc__power-btn d-cc__power-btn--danger" @click="onPower('shutdown')" title="关机">
              <DIcon name="fa-solid fa-power-off" class="d-cc__power-icon" />
              <span class="d-cc__power-label">关机</span>
            </button>
          </section>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.d-cc-overlay {
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

.d-cc {
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

.d-cc__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  flex-shrink: 0;
}

.d-cc__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--ditto-color-text-primary, #0f172a);
}

.d-cc__btn {
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
  transition: background 120ms, color 120ms;
}

.d-cc__btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--ditto-color-text-primary, #0f172a);
}

.d-cc__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* 紧凑切换按钮组 */
.d-cc__group {
  display: flex;
  align-items: stretch;
  margin-bottom: 16px;
  margin-left: -4px; /* 替代 gap，Chrome 80 兼容 */
}

.d-cc__tile {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 14px 8px;
  margin-left: 4px;
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 10px;
  background: var(--ditto-color-surface, #f8fafc);
  cursor: pointer;
  transition: background 120ms, border-color 120ms, transform 80ms;
  color: var(--ditto-color-text-secondary, #475569);
}

.d-cc__tile:hover {
  background: var(--ditto-color-primary-50, rgba(59, 130, 246, 0.06));
}

.d-cc__tile:active {
  transform: scale(0.96);
}

.d-cc__tile--active {
  background: var(--ditto-color-primary-500, #3b82f6);
  border-color: var(--ditto-color-primary-500, #3b82f6);
  color: #ffffff;
}

.d-cc__tile-icon {
  font-size: 20px;
  line-height: 1;
  margin-bottom: 6px;
}

.d-cc__tile-label {
  font-size: 12px;
  font-weight: 500;
}

/* 滑块组 */
.d-cc__sliders {
  border-top: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  padding-top: 16px;
  margin-top: 4px;
}

.d-cc__slider-row {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.d-cc__slider-row:last-child {
  margin-bottom: 0;
}

.d-cc__slider-icon {
  font-size: 16px;
  margin-right: 10px;
  flex-shrink: 0;
  width: 20px;
  text-align: center;
}

.d-cc__slider {
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  border-radius: 3px;
  background: var(--ditto-color-border-subtle, #e2e8f0);
  outline: none;
  cursor: pointer;
}

.d-cc__slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--ditto-color-primary-500, #3b82f6);
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  transition: transform 80ms;
}

.d-cc__slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.d-cc__slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--ditto-color-primary-500, #3b82f6);
  border: 2px solid #fff;
  cursor: pointer;
}

.d-cc__slider-value {
  margin-left: 10px;
  font-size: 12px;
  color: var(--ditto-color-text-secondary, #64748b);
  font-variant-numeric: tabular-nums;
  width: 32px;
  text-align: right;
  flex-shrink: 0;
}

/* 电源按钮区 */
.d-cc__power {
  display: flex;
  flex-wrap: wrap;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  margin-left: -4px; /* 替代 gap，Chrome 80 兼容 */
}

.d-cc__power-btn {
  flex: 1 1 calc(33.333% - 4px);
  min-width: 90px;
  margin-left: 4px;
  margin-bottom: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px 6px;
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 10px;
  background: var(--ditto-color-surface, #f8fafc);
  cursor: pointer;
  transition: background 120ms, border-color 120ms, transform 80ms;
  color: var(--ditto-color-text-secondary, #475569);
}

.d-cc__power-btn:hover {
  background: rgba(0, 0, 0, 0.04);
  color: var(--ditto-color-text-primary, #0f172a);
}

.d-cc__power-btn:active {
  transform: scale(0.96);
}

.d-cc__power-btn--danger:hover {
  background: var(--ditto-color-semantic-error, #ef4444);
  border-color: var(--ditto-color-semantic-error, #ef4444);
  color: #fff;
}

.d-cc__power-icon {
  font-size: 18px;
  line-height: 1;
  margin-bottom: 4px;
}

.d-cc__power-label {
  font-size: 11px;
  font-weight: 500;
}

/* 动画 */
.d-cc-overlay-enter-active,
.d-cc-overlay-leave-active {
  transition: opacity 200ms ease;
}
.d-cc-overlay-enter-from,
.d-cc-overlay-leave-to {
  opacity: 0;
}

.d-cc-panel-enter-active,
.d-cc-panel-leave-active {
  transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
.d-cc-panel-enter-from,
.d-cc-panel-leave-to {
  transform: translateX(100%);
}

@media (max-width: 768px) {
  .d-cc {
    width: 100vw;
    max-width: 100vw;
  }

  .d-cc__header {
    padding: 14px 16px;
  }

  .d-cc__btn {
    width: 40px;
    height: 40px;
  }

  .d-cc__tile {
    padding: 16px 8px;
  }

  .d-cc__power-btn {
    flex: 1 1 calc(50% - 4px);
    padding: 14px 6px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .d-cc-panel-enter-active,
  .d-cc-panel-leave-active,
  .d-cc-overlay-enter-active,
  .d-cc-overlay-leave-active {
    transition-duration: 0.01ms;
  }
}
</style>
