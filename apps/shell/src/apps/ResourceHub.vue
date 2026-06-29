<script setup lang="ts">
import { ref, computed } from 'vue';
import { useNotificationStore, useWindowStore, useAppStore } from '@ditto/services';
import { DIcon } from '@ditto/ui';

interface Resource {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  url?: string;
  /** 是否为本地应用入口（如 com.ditto.market） */
  localAppId?: string;
}

const notificationStore = useNotificationStore();
const windowStore = useWindowStore();
const appStore = useAppStore();

const resources = ref<Resource[]>([
  // 本地应用入口（跳转系统内应用）
  {
    id: 'mkt',
    name: 'Ditto 应用市场',
    description: '浏览、安装、更新第三方应用',
    category: '应用',
    icon: 'fa-solid fa-cart-shopping',
    localAppId: 'com.ditto.market',
  },
  // 外部资源（GitHub）
  {
    id: 'doc',
    name: 'Ditto 开发文档',
    description: '框架完整开发文档与 API 参考',
    category: '文档',
    icon: 'fa-solid fa-book',
    url: 'https://github.com/Nevino2333/Ditto',
  },
  {
    id: 'examples',
    name: '示例应用集合',
    description: '17 个示例应用，涵盖常见场景',
    category: '代码',
    icon: 'fa-solid fa-code',
    url: 'https://github.com/Nevino2333/Ditto/tree/main/server/data/apps',
  },
  {
    id: 'sdk',
    name: '插件开发 SDK',
    description: 'TypeScript SDK 与 API 参考',
    category: '代码',
    icon: 'fa-solid fa-screwdriver-wrench',
    url: 'https://github.com/Nevino2333/Ditto/tree/main/packages/sdk',
  },
  {
    id: 'teacher',
    name: '教师手册',
    description: 'Ditto 在教育场景的使用指南',
    category: '教育',
    icon: 'fa-solid fa-chalkboard-user',
    url: 'https://github.com/Nevino2333/Ditto/blob/main/docs/education-deployment.md',
  },
  {
    id: 'student',
    name: '学生入门指南',
    description: '学生快速上手 Ditto 的教程',
    category: '教育',
    icon: 'fa-solid fa-graduation-cap',
    url: 'https://github.com/Nevino2333/Ditto/blob/main/docs/getting-started.md',
  },
  {
    id: 'theme-pack',
    name: '主题包集合',
    description: '官方精选主题包',
    category: '主题',
    icon: 'fa-solid fa-palette',
    localAppId: 'com.ditto.market',
  },
  {
    id: 'icons',
    name: 'Font Awesome 图标库',
    description: '系统已集成的图标库使用指南',
    category: '资源',
    icon: 'fa-solid fa-icons',
    url: 'https://fontawesome.com/icons',
  },
  {
    id: 'cli',
    name: 'CLI 脚手架工具',
    description: '命令行创建、打包、签名应用',
    category: '代码',
    icon: 'fa-solid fa-terminal',
    url: 'https://github.com/Nevino2333/Ditto/tree/main/packages/cli',
  },
  {
    id: 'packager',
    name: '打包器文档',
    description: '.dit/.ditx/.ditc/.ditz 包格式说明',
    category: '文档',
    icon: 'fa-solid fa-box-archive',
    url: 'https://github.com/Nevino2333/Ditto/blob/main/docs/third-party-app-development.md',
  },
]);

const selectedCategory = ref('全部');
const searchQuery = ref('');
const categories = ['全部', '应用', '文档', '代码', '主题', '教育', '资源'];

const filteredResources = computed(() => {
  let list = resources.value;
  if (selectedCategory.value !== '全部') {
    list = list.filter((r) => r.category === selectedCategory.value);
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    list = list.filter(
      (r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
    );
  }
  return list;
});

function filterByCategory(cat: string) {
  selectedCategory.value = cat;
}

async function openResource(resource: Resource) {
  if (resource.localAppId) {
    // 跳转到本地应用
    const manifest = appStore.apps.find((a) => a.id === resource.localAppId);
    if (manifest) {
      await appStore.launchApp(resource.localAppId);
      // 关闭资源仓库窗口，避免叠加
      const currentWindow = windowStore.windows.find((w) => w.appId === 'com.ditto.resources');
      if (currentWindow) windowStore.closeWindow(currentWindow.id);
      return;
    }
  }
  if (resource.url) {
    window.open(resource.url, '_blank', 'noopener,noreferrer');
    notificationStore.pushNotification({
      title: '打开外部资源',
      body: `已在新窗口打开「${resource.name}」`,
      type: 'info',
      source: 'resources',
      persistent: false,
    });
  } else {
    notificationStore.pushNotification({
      title: '资源不可用',
      body: `「${resource.name}」暂时无法访问`,
      type: 'warning',
      source: 'resources',
      persistent: false,
    });
  }
}

// 区分应用类资源（localAppId）和外链资源，应用类按钮文案为"打开"，外链为"访问"
function getActionLabel(resource: Resource): string {
  if (resource.localAppId) return '打开';
  return resource.url ? '访问' : '查看';
}
</script>

<template>
  <div class="resource-hub">
    <div class="resource-hub__header">
      <h2 class="resource-hub__title">
        <DIcon name="fa-solid fa-box-archive" />
        资源中心
      </h2>
      <input
        v-model="searchQuery"
        type="text"
        class="resource-hub__search"
        placeholder="搜索资源..."
        aria-label="搜索资源"
      />
    </div>

    <div class="resource-hub__categories">
      <button
        v-for="cat in categories"
        :key="cat"
        class="category-btn"
        :class="{ 'category-btn--active': selectedCategory === cat }"
        @click="filterByCategory(cat)"
      >
        {{ cat }}
      </button>
    </div>

    <div class="resource-hub__list">
      <div v-if="!filteredResources.length" class="resource-hub__empty">
        <DIcon name="fa-solid fa-magnifying-glass" />
        <span>没有找到匹配的资源</span>
      </div>

      <div
        v-for="res in filteredResources"
        :key="res.id"
        class="resource-card"
        :class="{ 'resource-card--app': !!res.localAppId }"
        @click="openResource(res)"
      >
        <DIcon :name="res.icon" class="resource-card__icon" />
        <div class="resource-card__info">
          <span class="resource-card__name">{{ res.name }}</span>
          <span class="resource-card__desc">{{ res.description }}</span>
          <div class="resource-card__meta">
            <span class="resource-card__category">{{ res.category }}</span>
            <span v-if="res.localAppId" class="resource-card__type resource-card__type--app">
              <DIcon name="fa-solid fa-window-restore" /> 本地应用
            </span>
            <span v-else class="resource-card__type resource-card__type--link">
              <DIcon name="fa-solid fa-up-right-from-square" /> 外部链接
            </span>
          </div>
        </div>
        <button class="resource-card__action" @click.stop="openResource(res)">
          <DIcon name="fa-solid fa-arrow-right" />
          {{ getActionLabel(res) }}
        </button>
      </div>
    </div>

    <footer class="resource-hub__footer">
      <DIcon name="fa-solid fa-circle-info" />
      资源中心聚合了文档、教程、代码示例与系统应用入口。如需安装新应用，请前往
      <a class="resource-hub__link" @click="openResource(resources[0])">Ditto 应用市场</a>。
    </footer>
  </div>
</template>

<style scoped>
.resource-hub {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.resource-hub__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
}

.resource-hub__title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  display: inline-flex;
  align-items: center;
  color: var(--ditto-color-text-primary, #0f172a);
}

.resource-hub__title > :first-child {
  margin-right: 8px;
  color: var(--ditto-color-primary-500, #3b82f6);
}

.resource-hub__search {
  flex: 1;
  max-width: 240px;
  padding: 6px 12px;
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 6px;
  font-size: 12px;
  background: var(--ditto-color-surface-base, #fff);
  color: var(--ditto-color-text-primary, #0f172a);
  outline: none;
  transition: border-color 120ms;
}

.resource-hub__search:focus {
  border-color: var(--ditto-color-primary-500, #3b82f6);
}

.resource-hub__categories {
  display: flex;
  padding: 8px 16px;
  border-bottom: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  overflow-x: auto;
}

.category-btn {
  padding: 4px 12px;
  margin-right: 6px;
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 16px;
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  color: var(--ditto-color-text-secondary, #475569);
  transition: all 120ms;
}

.category-btn:hover {
  border-color: var(--ditto-color-primary-300, #93c5fd);
}

.category-btn--active {
  background: var(--ditto-color-primary-500, #3b82f6);
  color: white;
  border-color: var(--ditto-color-primary-500, #3b82f6);
}

.resource-hub__list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.resource-hub__list > * {
  margin-bottom: 8px;
}

.resource-hub__empty {
  text-align: center;
  padding: 32px;
  color: var(--ditto-color-text-disabled, #94a3b8);
  font-size: 13px;
}

.resource-hub__empty > :first-child {
  font-size: 24px;
  display: block;
  margin-bottom: 8px;
}

.resource-card {
  display: flex;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 120ms, background 120ms, transform 100ms;
}

.resource-card:hover {
  border-color: var(--ditto-color-primary-300, #93c5fd);
  background: rgba(59, 130, 246, 0.02);
  transform: translateY(-1px);
}

.resource-card--app {
  border-color: var(--ditto-color-primary-200, #bfdbfe);
  background: rgba(59, 130, 246, 0.04);
}

.resource-card--app:hover {
  background: rgba(59, 130, 246, 0.08);
}

.resource-card__icon {
  font-size: 28px;
  color: var(--ditto-color-primary-500, #3b82f6);
  margin-right: 12px;
  flex-shrink: 0;
  width: 32px;
  text-align: center;
}

.resource-card__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.resource-card__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ditto-color-text-primary, #0f172a);
}

.resource-card__desc {
  font-size: 12px;
  color: var(--ditto-color-text-secondary, #475569);
  margin-top: 2px;
}

.resource-card__meta {
  display: flex;
  align-items: center;
  margin-top: 4px;
}

.resource-card__meta > * {
  margin-right: 8px;
}

.resource-card__category {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--ditto-color-surface-raised, #f8fafc);
  color: var(--ditto-color-text-secondary, #475569);
}

.resource-card__type {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  color: var(--ditto-color-text-disabled, #94a3b8);
}

.resource-card__type > :first-child {
  margin-right: 3px;
}

.resource-card__type--app {
  color: var(--ditto-color-primary-600, #2563eb);
}

.resource-card__action {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  background: var(--ditto-color-primary-500, #3b82f6);
  color: white;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 120ms;
  margin-left: 12px;
}

.resource-card__action > :first-child {
  margin-right: 4px;
}

.resource-card__action:hover {
  background: var(--ditto-color-primary-600, #2563eb);
}

.resource-hub__footer {
  padding: 10px 16px;
  border-top: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  font-size: 11px;
  color: var(--ditto-color-text-secondary, #475569);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  line-height: 1.5;
}

.resource-hub__footer > :first-child {
  margin-right: 6px;
  color: var(--ditto-color-primary-500, #3b82f6);
}

.resource-hub__link {
  color: var(--ditto-color-primary-600, #2563eb);
  cursor: pointer;
  text-decoration: underline;
  margin: 0 2px;
}

.resource-hub__link:hover {
  color: var(--ditto-color-primary-700, #1d4ed8);
}

/* 移动端适配 */
@media (max-width: 600px) {
  .resource-hub__header {
    flex-direction: column;
    align-items: stretch;
    padding: 10px 12px;
  }

  .resource-hub__search {
    max-width: none;
    margin-top: 8px;
  }

  .resource-card {
    flex-direction: column;
    align-items: stretch;
    padding: 14px 12px;
  }

  .resource-card__icon {
    margin-bottom: 8px;
    margin-right: 0;
  }

  .resource-card__action {
    margin-left: 0;
    margin-top: 10px;
    width: 100%;
    justify-content: center;
  }
}
</style>
