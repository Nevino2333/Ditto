<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getVFS } from '@ditto/services';

const vfs = getVFS();
const currentPath = ref('/');
const entries = ref(await vfs.ls('/'));
const loading = ref(false);
const error = ref<string | null>(null);

async function navigate(path: string) {
  loading.value = true;
  error.value = null;
  try {
    currentPath.value = path;
    entries.value = await vfs.ls(path);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function openFolder(entry: { path: string; type: string }) {
  if (entry.type === 'directory') {
    navigate(entry.path);
  }
}

function goUp() {
  const parts = currentPath.value.split('/').filter(Boolean);
  parts.pop();
  navigate('/' + parts.join('/'));
}

function formatSize(size: number): string {
  if (size === 0) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function createFolder() {
  const name = prompt('文件夹名称:');
  if (!name) return;
  const path = currentPath.value === '/' ? `/${name}` : `${currentPath.value}/${name}`;
  try {
    await vfs.mkdir(path);
    await navigate(currentPath.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function createFile() {
  const name = prompt('文件名称:');
  if (!name) return;
  const path = currentPath.value === '/' ? `/${name}` : `${currentPath.value}/${name}`;
  try {
    await vfs.writeText(path, '');
    await navigate(currentPath.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function deleteEntry(entry: { path: string; name: string }) {
  if (!confirm(`确定删除 "${entry.name}" 吗？`)) return;
  try {
    await vfs.delete(entry.path);
    await navigate(currentPath.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

onMounted(() => navigate('/'));
</script>

<template>
  <div class="file-manager">
    <div class="file-manager__toolbar">
      <button class="fm-btn" @click="goUp" :disabled="currentPath === '/'" title="上级目录">⬆️</button>
      <button class="fm-btn" @click="navigate(currentPath)" title="刷新">🔄</button>
      <div class="file-manager__path">{{ currentPath }}</div>
      <button class="fm-btn" @click="createFolder" title="新建文件夹">📁+</button>
      <button class="fm-btn" @click="createFile" title="新建文件">📄+</button>
    </div>
    <div v-if="error" class="file-manager__error">{{ error }}</div>
    <div v-if="loading" class="file-manager__loading">加载中...</div>
    <div v-else class="file-manager__list">
      <div v-if="entries.length === 0" class="file-manager__empty">此文件夹为空</div>
      <div
        v-for="entry in entries"
        :key="entry.path"
        class="file-manager__entry"
        :class="{ 'file-manager__entry--dir': entry.type === 'directory' }"
        @dblclick="openFolder(entry)"
      >
        <span class="file-manager__entry-icon">
          {{ entry.type === 'directory' ? '📁' : '📄' }}
        </span>
        <span class="file-manager__entry-name">{{ entry.name }}</span>
        <span class="file-manager__entry-size">{{ formatSize(entry.size) }}</span>
        <span class="file-manager__entry-date">{{ formatDate(entry.modifiedAt) }}</span>
        <button class="file-manager__entry-delete" @click.stop="deleteEntry(entry)" title="删除">🗑️</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-manager {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-size: 13px;
}

.file-manager__toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  background: var(--ditto-color-surface-raised, #f8fafc);
}

.fm-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 16px;
  transition: background 120ms;
}

.fm-btn:hover:not(:disabled) { background: rgba(0,0,0,0.06); }
.fm-btn:disabled { opacity: 0.3; cursor: default; }

.file-manager__path {
  flex: 1;
  padding: 4px 10px;
  border-radius: 4px;
  background: var(--ditto-color-surface-base, #fff);
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  font-family: monospace;
  font-size: 12px;
  color: var(--ditto-color-text-secondary, #475569);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-manager__error {
  padding: 8px 12px;
  background: #fef2f2;
  color: var(--ditto-color-semantic-error, #ef4444);
  font-size: 12px;
}

.file-manager__loading,
.file-manager__empty {
  padding: 32px;
  text-align: center;
  color: var(--ditto-color-text-disabled, #94a3b8);
}

.file-manager__list {
  flex: 1;
  overflow-y: auto;
}

.file-manager__entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: default;
  transition: background 80ms;
}

.file-manager__entry:hover {
  background: rgba(0, 0, 0, 0.03);
}

.file-manager__entry--dir {
  cursor: pointer;
}

.file-manager__entry-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.file-manager__entry-name {
  flex: 1;
  color: var(--ditto-color-text-primary, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-manager__entry-size {
  width: 70px;
  text-align: right;
  color: var(--ditto-color-text-secondary, #475569);
  font-size: 12px;
}

.file-manager__entry-date {
  width: 100px;
  color: var(--ditto-color-text-secondary, #475569);
  font-size: 12px;
}

.file-manager__entry-delete {
  opacity: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px;
  transition: opacity 120ms;
}

.file-manager__entry:hover .file-manager__entry-delete {
  opacity: 0.6;
}

.file-manager__entry-delete:hover {
  opacity: 1 !important;
}
</style>
