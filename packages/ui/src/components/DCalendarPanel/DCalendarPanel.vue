<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';

const props = defineProps<{
  visible: boolean;
  anchor?: { x: number; y: number };
}>();
const emit = defineEmits<{
  (e: 'close'): void;
}>();

// 实时时钟（每秒更新）
const now = ref(new Date());
// 当前展示的月份
const viewMonth = ref(new Date());

let clockTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  clockTimer = setInterval(() => {
    now.value = new Date();
  }, 1000);
});

onBeforeUnmount(() => {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
});

// 透明遮罩引用：打开时聚焦以接收 Esc
const overlayRef = ref<HTMLElement | null>(null);

// 面板打开时：重置到当前月份并聚焦
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      viewMonth.value = new Date();
      nextTick(() => {
        if (overlayRef.value) overlayRef.value.focus();
      });
    }
  }
);

const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日'];

interface CalendarCell {
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  date: Date;
}

// 生成 6 周（42 格）的日历网格，以周一为首日
const calendarCells = computed<CalendarCell[]>(() => {
  const year = viewMonth.value.getFullYear();
  const month = viewMonth.value.getMonth();
  const first = new Date(year, month, 1);
  // getDay() 返回 0=周日，转换为以周一为首日
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  const today = new Date();
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({
      day: d.getDate(),
      isCurrentMonth: d.getMonth() === month,
      isToday:
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate(),
      date: d,
    });
  }
  return cells;
});

const monthLabel = computed(() => {
  return `${viewMonth.value.getFullYear()} 年 ${viewMonth.value.getMonth() + 1} 月`;
});

const timeLabel = computed(() => {
  const h = String(now.value.getHours()).padStart(2, '0');
  const m = String(now.value.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
});

const secondLabel = computed(() => {
  return String(now.value.getSeconds()).padStart(2, '0');
});

const dateLabel = computed(() => {
  const y = now.value.getFullYear();
  const m = now.value.getMonth() + 1;
  const d = now.value.getDate();
  const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${y} 年 ${m} 月 ${d} 日 · ${weekdayNames[now.value.getDay()]}`;
});

// 数值夹紧工具
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// 是否在锚点上方展开（任务栏在底部时为 true）
const opensAbove = computed(() => {
  if (!props.anchor) return true;
  if (typeof window === 'undefined') return true;
  return props.anchor.y > window.innerHeight / 2;
});

// 面板定位：基于锚点水平居中，并做视口夹紧
const panelStyle = computed(() => {
  if (typeof window === 'undefined') return {};
  const panelWidth = 300;
  const panelHeight = 380;
  // 无锚点时：靠右下定位
  if (!props.anchor) {
    return {
      left: `${window.innerWidth - panelWidth - 16}px`,
      top: `${window.innerHeight - panelHeight - 60}px`,
    };
  }
  let left = props.anchor.x - panelWidth / 2;
  left = clamp(left, 8, window.innerWidth - panelWidth - 8);
  if (opensAbove.value) {
    // 在锚点上方展开
    let top = props.anchor.y - panelHeight - 8;
    if (top < 8) top = props.anchor.y + 8; // 空间不足时翻到下方
    return { left: `${left}px`, top: `${top}px` };
  }
  // 在锚点下方展开
  let top = props.anchor.y + 8;
  if (top + panelHeight > window.innerHeight - 8) {
    top = window.innerHeight - panelHeight - 8;
  }
  return { left: `${left}px`, top: `${top}px` };
});

function prevMonth() {
  const d = new Date(viewMonth.value);
  d.setMonth(d.getMonth() - 1);
  viewMonth.value = d;
}

function nextMonth() {
  const d = new Date(viewMonth.value);
  d.setMonth(d.getMonth() + 1);
  viewMonth.value = d;
}

function goToToday() {
  viewMonth.value = new Date();
}

// 点击某天：切换到该日期所属月份（便于点击其他月份的日期导航）
function selectDay(cell: CalendarCell) {
  viewMonth.value = new Date(cell.date.getFullYear(), cell.date.getMonth(), 1);
}

function dayLabel(cell: CalendarCell): string {
  return `${cell.date.getFullYear()}年${cell.date.getMonth() + 1}月${cell.day}日`;
}

function onOverlayClick() {
  emit('close');
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="d-calendar">
      <div
        v-if="visible"
        ref="overlayRef"
        class="d-calendar-overlay"
        tabindex="0"
        role="dialog"
        aria-label="日历"
        @click="onOverlayClick"
        @keydown="onKeydown"
      >
        <div
          class="d-calendar-panel"
          :class="opensAbove ? 'opens-above' : 'opens-below'"
          :style="panelStyle"
          @click.stop
        >
          <!-- 时钟区域 -->
          <div class="d-calendar__clock">
            <div class="d-calendar__time">
              {{ timeLabel }}<span class="d-calendar__seconds">:{{ secondLabel }}</span>
            </div>
            <div class="d-calendar__date">{{ dateLabel }}</div>
          </div>

          <!-- 月份切换 -->
          <div class="d-calendar__header">
            <button type="button" class="d-calendar__nav" aria-label="上一月" @click="prevMonth">‹</button>
            <button type="button" class="d-calendar__month" aria-label="跳转到今天" @click="goToToday">{{ monthLabel }}</button>
            <button type="button" class="d-calendar__nav" aria-label="下一月" @click="nextMonth">›</button>
          </div>

          <!-- 星期表头 -->
          <div class="d-calendar__weekdays">
            <span v-for="w in weekdayLabels" :key="w" class="d-calendar__weekday">{{ w }}</span>
          </div>

          <!-- 日期网格 -->
          <div class="d-calendar__grid">
            <button
              v-for="(cell, i) in calendarCells"
              :key="i"
              type="button"
              class="d-calendar__day"
              :class="{ 'is-today': cell.isToday, 'is-other': !cell.isCurrentMonth }"
              :aria-label="cell.isToday ? '今天' : dayLabel(cell)"
              :aria-current="cell.isToday ? 'date' : false"
              @click="selectDay(cell)"
            >{{ cell.day }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 透明遮罩：捕获外部点击关闭，但不遮挡桌面 */
.d-calendar-overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 9500;
  background: transparent;
  outline: none;
}

.d-calendar-panel {
  position: fixed;
  width: 300px;
  background: var(--ditto-color-surface-overlay, #ffffff);
  border-radius: var(--ditto-radius-window, 10px);
  box-shadow: var(--ditto-shadow-dropdown, 0 8px 24px rgba(0, 0, 0, 0.12));
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  overflow: hidden;
  padding: 16px;
}

/* 时钟区域 */
.d-calendar__clock {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  margin-bottom: 12px;
}

.d-calendar__time {
  font-size: 36px;
  font-weight: 600;
  line-height: 1.1;
  color: var(--ditto-color-text-primary, #0f172a);
  font-variant-numeric: tabular-nums;
}

.d-calendar__seconds {
  font-size: 18px;
  font-weight: 400;
  color: var(--ditto-color-text-secondary, #475569);
  margin-left: 2px;
}

.d-calendar__date {
  font-size: 12px;
  color: var(--ditto-color-text-secondary, #475569);
  margin-top: 4px;
}

/* 月份切换头（flex 布局，使用子元素 margin 代替 gap） */
.d-calendar__header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.d-calendar__nav {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  color: var(--ditto-color-text-secondary, #475569);
  width: 32px;
  height: 32px;
  border-radius: var(--ditto-radius-button, 6px);
  transition: background var(--ditto-motion-duration-fast, 150ms) ease;
}

.d-calendar__nav:hover {
  background: var(--ditto-color-surface-raised, #f8fafc);
  color: var(--ditto-color-text-primary, #0f172a);
}

.d-calendar__month {
  flex: 1;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--ditto-color-text-primary, #0f172a);
  padding: 6px 4px;
  border-radius: var(--ditto-radius-button, 6px);
  transition: background var(--ditto-motion-duration-fast, 150ms) ease;
}

.d-calendar__month:hover {
  background: var(--ditto-color-surface-raised, #f8fafc);
}

/* 星期表头（grid 7 列） */
.d-calendar__weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 4px;
}

.d-calendar__weekday {
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--ditto-color-text-secondary, #475569);
  padding: 4px 0;
}

/* 日期网格（grid 7 列） */
.d-calendar__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.d-calendar__day {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--ditto-color-text-primary, #0f172a);
  height: 36px;
  border-radius: var(--ditto-radius-pill, 9999px);
  transition: background var(--ditto-motion-duration-fast, 150ms) ease;
}

.d-calendar__day:hover {
  background: var(--ditto-color-surface-raised, #f8fafc);
}

/* 其他月份的日期：低对比度 */
.d-calendar__day.is-other {
  color: var(--ditto-color-text-disabled, #94a3b8);
}

/* 今天高亮 */
.d-calendar__day.is-today {
  background: var(--ditto-color-primary-500, #3b82f6);
  color: var(--ditto-color-text-inverse, #ffffff);
  font-weight: 600;
}

.d-calendar__day.is-today:hover {
  background: var(--ditto-color-primary-600, #2563eb);
}

/* 入场/出场动画：遮罩淡入 + 面板从底部/上方滑入 */
.d-calendar-enter-active,
.d-calendar-leave-active {
  transition: opacity var(--ditto-motion-duration-fast, 150ms) var(--ditto-motion-easing-default, cubic-bezier(0.4, 0, 0.2, 1));
}

.d-calendar-enter-from,
.d-calendar-leave-to {
  opacity: 0;
}

.d-calendar-enter-active .d-calendar-panel,
.d-calendar-leave-active .d-calendar-panel {
  transition:
    transform var(--ditto-motion-duration-normal, 250ms) var(--ditto-motion-easing-decelerate, cubic-bezier(0, 0, 0.2, 1)),
    opacity var(--ditto-motion-duration-normal, 250ms) ease;
}

.d-calendar-enter-from .d-calendar-panel.opens-above,
.d-calendar-leave-to .d-calendar-panel.opens-above {
  transform: translateY(12px);
  opacity: 0;
}

.d-calendar-enter-from .d-calendar-panel.opens-below,
.d-calendar-leave-to .d-calendar-panel.opens-below {
  transform: translateY(-12px);
  opacity: 0;
}

/* 移动端：触控友好的日期单元格 */
@media (max-width: 768px) {
  .d-calendar-panel {
    width: min(300px, 92vw);
  }

  .d-calendar__nav {
    width: 44px;
    height: 44px;
    font-size: 20px;
  }

  .d-calendar__day {
    height: 44px;
    font-size: 14px;
  }

  .d-calendar__time {
    font-size: 32px;
  }

  .d-calendar__seconds {
    font-size: 16px;
  }
}
</style>
