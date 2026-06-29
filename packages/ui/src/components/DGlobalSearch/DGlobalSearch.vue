<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { useSearchStore, useAppStore } from '@ditto/services';
import type { SearchItem } from '@ditto/services';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (e: 'close'): void;
}>();

const searchStore = useSearchStore();
const appStore = useAppStore();

const query = ref('');
const results = ref<SearchItem[]>([]);
// 当前选中的结果索引；-1 表示无选中
const selectedIndex = ref(-1);
const inputRef = ref<HTMLInputElement | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// 执行搜索（300ms 防抖）
function runSearch(value: string) {
  const q = value.trim();
  if (!q) {
    results.value = [];
    selectedIndex.value = -1;
    return;
  }
  results.value = searchStore.search(q, appStore.apps);
  selectedIndex.value = results.value.length > 0 ? 0 : -1;
}

watch(query, (value) => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    runSearch(value);
  }, 300);
});

// 结果按 category 分组，保留平铺索引以便键盘导航
const groupedResults = computed(() => {
  const map = new Map<string, { item: SearchItem; flatIndex: number }[]>();
  results.value.forEach((item, flatIndex) => {
    const arr = map.get(item.category);
    const entry = { item, flatIndex };
    if (arr) {
      arr.push(entry);
    } else {
      map.set(item.category, [entry]);
    }
  });
  return Array.from(map, ([category, items]) => ({ category, items }));
});

const recentSearches = computed(() => searchStore.recentSearches);
const hasQuery = computed(() => query.value.trim().length > 0);

// 面板打开时：清空状态并聚焦输入框
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      query.value = '';
      results.value = [];
      selectedIndex.value = -1;
      nextTick(() => {
        if (inputRef.value) inputRef.value.focus();
      });
    }
  }
);

// 切换选中项：direction 1=下一个，-1=上一个
function moveSelection(direction: 1 | -1) {
  const len = results.value.length;
  if (len === 0) return;
  if (selectedIndex.value < 0) {
    selectedIndex.value = direction > 0 ? 0 : len - 1;
    return;
  }
  selectedIndex.value = (selectedIndex.value + direction + len) % len;
}

// 执行某个结果项：记录最近搜索、触发 action、关闭
function executeItem(item: SearchItem) {
  searchStore.addRecentSearch(query.value);
  item.action();
  emit('close');
}

function onItemClick(item: SearchItem) {
  executeItem(item);
}

function onUseRecent(term: string) {
  query.value = term;
}

function onClearRecent() {
  searchStore.clearRecentSearches();
}

function onOverlayClick() {
  emit('close');
}

function onKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'Escape':
      event.preventDefault();
      emit('close');
      break;
    case 'ArrowDown':
      event.preventDefault();
      moveSelection(1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      moveSelection(-1);
      break;
    case 'Enter':
      event.preventDefault();
      if (selectedIndex.value >= 0) {
        const item = results.value[selectedIndex.value];
        if (item) {
          executeItem(item);
        }
      }
      break;
  }
}

onBeforeUnmount(() => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="d-global-search">
      <div
        v-if="visible"
        class="d-global-search-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="全局搜索"
        @click="onOverlayClick"
        @keydown="onKeydown"
      >
        <div class="d-global-search__panel" @click.stop>
          <!-- 搜索框 -->
          <div class="d-global-search__input-wrap">
            <span class="d-global-search__icon" aria-hidden="true">🔍</span>
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              class="d-global-search__input"
              placeholder="搜索应用、命令..."
              aria-label="搜索"
              autocomplete="off"
              spellcheck="false"
            />
            <button
              v-if="hasQuery"
              class="d-global-search__clear"
              type="button"
              aria-label="清空搜索"
              @click="query = ''"
            >✕</button>
          </div>

          <div class="d-global-search__body">
            <!-- 搜索结果（按类别分组） -->
            <template v-if="results.length > 0">
              <div
                v-for="group in groupedResults"
                :key="group.category"
                class="d-global-search__group"
              >
                <div class="d-global-search__group-label">{{ group.category }}</div>
                <button
                  v-for="entry in group.items"
                  :key="entry.item.id"
                  type="button"
                  class="d-global-search__result"
                  :class="{ 'is-selected': entry.flatIndex === selectedIndex }"
                  :aria-label="entry.item.title"
                  @click="onItemClick(entry.item)"
                  @mouseenter="selectedIndex = entry.flatIndex"
                >
                  <span class="d-global-search__result-icon">{{ entry.item.icon || '🔹' }}</span>
                  <div class="d-global-search__result-info">
                    <span class="d-global-search__result-title">{{ entry.item.title }}</span>
                    <span v-if="entry.item.description" class="d-global-search__result-desc">{{ entry.item.description }}</span>
                  </div>
                </button>
              </div>
            </template>

            <!-- 最近搜索（仅在无查询时显示） -->
            <template v-else-if="!hasQuery && recentSearches.length > 0">
              <div class="d-global-search__group">
                <div class="d-global-search__group-label">
                  <span>最近搜索</span>
                  <button type="button" class="d-global-search__clear-recent" @click="onClearRecent">清除</button>
                </div>
                <button
                  v-for="(term, i) in recentSearches"
                  :key="i"
                  type="button"
                  class="d-global-search__recent"
                  @click="onUseRecent(term)"
                >{{ term }}</button>
              </div>
            </template>

            <!-- 空状态：有查询但无结果 -->
            <div v-else-if="hasQuery" class="d-global-search__empty">
              未找到匹配结果
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.d-global-search-overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 9800;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  outline: none;
}

.d-global-search__panel {
  width: min(560px, 92vw);
  max-height: 70vh;
  background: var(--ditto-color-surface-overlay, #ffffff);
  border-radius: var(--ditto-radius-window, 10px);
  box-shadow: var(--ditto-shadow-windowFocused, 0 8px 32px rgba(59, 130, 246, 0.12));
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 搜索框容器（flex 布局，使用子元素 margin 代替 gap） */
.d-global-search__input-wrap {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
}

.d-global-search__icon {
  margin-right: 10px;
  font-size: 16px;
  flex-shrink: 0;
}

.d-global-search__input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 16px;
  color: var(--ditto-color-text-primary, #0f172a);
}

.d-global-search__input::placeholder {
  color: var(--ditto-color-text-disabled, #94a3b8);
}

.d-global-search__clear {
  margin-left: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--ditto-color-text-secondary, #475569);
  min-width: 32px;
  min-height: 32px;
  border-radius: var(--ditto-radius-button, 6px);
  transition: background var(--ditto-motion-duration-fast, 150ms) ease;
}

.d-global-search__clear:hover {
  background: var(--ditto-color-surface-raised, #f8fafc);
}

.d-global-search__body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.d-global-search__group {
  margin-bottom: 8px;
}

.d-global-search__group-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ditto-color-text-secondary, #475569);
}

.d-global-search__clear-recent {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  color: var(--ditto-color-primary-500, #3b82f6);
  padding: 2px 4px;
  border-radius: var(--ditto-radius-button, 6px);
}

/* 结果项（flex 布局，使用子元素 margin 代替 gap） */
.d-global-search__result {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: var(--ditto-radius-card, 8px);
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background var(--ditto-motion-duration-fast, 150ms) ease;
}

.d-global-search__result:hover,
.d-global-search__result.is-selected {
  background: var(--ditto-color-primary-50, #eff6ff);
}

.d-global-search__result-icon {
  font-size: 20px;
  line-height: 1;
  margin-right: 12px;
  flex-shrink: 0;
}

.d-global-search__result-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.d-global-search__result-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--ditto-color-text-primary, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.d-global-search__result-desc {
  font-size: 12px;
  color: var(--ditto-color-text-secondary, #475569);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.d-global-search__recent {
  display: block;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: var(--ditto-radius-card, 8px);
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  color: var(--ditto-color-text-primary, #0f172a);
  transition: background var(--ditto-motion-duration-fast, 150ms) ease;
}

.d-global-search__recent:hover {
  background: var(--ditto-color-surface-raised, #f8fafc);
}

.d-global-search__empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--ditto-color-text-disabled, #94a3b8);
  font-size: 14px;
}

/* 入场/出场动画：遮罩淡入 + 面板上滑淡入 */
.d-global-search-enter-active,
.d-global-search-leave-active {
  transition: opacity var(--ditto-motion-duration-fast, 150ms) var(--ditto-motion-easing-default, cubic-bezier(0.4, 0, 0.2, 1));
}

.d-global-search-enter-from,
.d-global-search-leave-to {
  opacity: 0;
}

.d-global-search-enter-active .d-global-search__panel,
.d-global-search-leave-active .d-global-search__panel {
  transition:
    transform var(--ditto-motion-duration-normal, 250ms) var(--ditto-motion-easing-decelerate, cubic-bezier(0, 0, 0.2, 1)),
    opacity var(--ditto-motion-duration-normal, 250ms) ease;
}

.d-global-search-enter-from .d-global-search__panel,
.d-global-search-leave-to .d-global-search__panel {
  transform: translateY(-12px);
  opacity: 0;
}

/* 移动端：触控友好 */
@media (max-width: 768px) {
  .d-global-search-overlay {
    padding-top: 6vh;
  }

  .d-global-search__input-wrap {
    padding: 14px 16px;
  }

  .d-global-search__input {
    font-size: 16px;
  }

  .d-global-search__clear {
    min-width: 44px;
    min-height: 44px;
  }

  .d-global-search__result {
    padding: 14px 12px;
  }

  .d-global-search__result-icon {
    font-size: 24px;
    margin-right: 14px;
  }

  .d-global-search__recent {
    padding: 12px;
  }
}

/* 平板：略小尺寸 */
@media (min-width: 769px) and (max-width: 1024px) {
  .d-global-search-overlay {
    padding-top: 10vh;
  }
}
</style>
