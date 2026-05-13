<script setup lang="ts">
import { ref } from 'vue';

interface Resource {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  size: string;
  downloads: number;
}

const resources = ref<Resource[]>([
  { id: '1', name: 'Ditto 开发文档', description: 'Ditto WebOS 框架完整开发文档', category: '文档', icon: '📖', size: '2.4 MB', downloads: 128 },
  { id: '2', name: '示例应用集合', description: '10 个示例应用，涵盖常见场景', category: '代码', icon: '💻', size: '1.8 MB', downloads: 96 },
  { id: '3', name: '主题包 - 暗夜', description: '优雅的深色主题', category: '主题', icon: '🎨', size: '0.3 MB', downloads: 256 },
  { id: '4', name: '教学课件模板', description: '适用于在线教育的课件模板', category: '教育', icon: '🎓', size: '5.1 MB', downloads: 64 },
  { id: '5', name: '办公套件', description: '文档编辑、表格、演示文稿', category: '办公', icon: '📊', size: '8.2 MB', downloads: 192 },
  { id: '6', name: '图标库', description: '2000+ 精选 SVG 图标', category: '资源', icon: '🖼️', size: '3.6 MB', downloads: 320 },
]);

const selectedCategory = ref('全部');
const categories = ['全部', '文档', '代码', '主题', '教育', '办公', '资源'];

const filteredResources = ref(resources.value);

function filterByCategory(cat: string) {
  selectedCategory.value = cat;
  if (cat === '全部') {
    filteredResources.value = resources.value;
  } else {
    filteredResources.value = resources.value.filter((r) => r.category === cat);
  }
}

function downloadResource(resource: Resource) {
  alert(`下载 "${resource.name}" - 功能开发中`);
}
</script>

<template>
  <div class="resource-hub">
    <div class="resource-hub__header">
      <h2 class="resource-hub__title">📦 资源仓库</h2>
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
      <div v-for="res in filteredResources" :key="res.id" class="resource-card">
        <span class="resource-card__icon">{{ res.icon }}</span>
        <div class="resource-card__info">
          <span class="resource-card__name">{{ res.name }}</span>
          <span class="resource-card__desc">{{ res.description }}</span>
          <div class="resource-card__meta">
            <span class="resource-card__category">{{ res.category }}</span>
            <span class="resource-card__size">{{ res.size }}</span>
            <span class="resource-card__downloads">⬇️ {{ res.downloads }}</span>
          </div>
        </div>
        <button class="resource-card__download" @click="downloadResource(res)">下载</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.resource-hub {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.resource-hub__header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
}

.resource-hub__title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.resource-hub__categories {
  display: flex;
  gap: 6px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  overflow-x: auto;
}

.category-btn {
  padding: 4px 12px;
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 16px;
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  color: var(--ditto-color-text-secondary, #475569);
  transition: all 120ms;
}

.category-btn:hover { border-color: var(--ditto-color-primary-300, #93c5fd); }

.category-btn--active {
  background: var(--ditto-color-primary-500, #3b82f6);
  color: white;
  border-color: var(--ditto-color-primary-500, #3b82f6);
}

.resource-hub__list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.resource-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 8px;
  transition: border-color 120ms;
}

.resource-card:hover {
  border-color: var(--ditto-color-primary-300, #93c5fd);
}

.resource-card__icon {
  font-size: 32px;
  flex-shrink: 0;
}

.resource-card__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
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
}

.resource-card__meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--ditto-color-text-disabled, #94a3b8);
  margin-top: 2px;
}

.resource-card__category {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--ditto-color-surface-raised, #f8fafc);
}

.resource-card__download {
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  background: var(--ditto-color-primary-500, #3b82f6);
  color: white;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 120ms;
}

.resource-card__download:hover {
  background: var(--ditto-color-primary-600, #2563eb);
}
</style>
