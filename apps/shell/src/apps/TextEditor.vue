<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { getVFS, useDialogStore, useNotificationStore } from '@ditto/services';

const vfs = getVFS();
const dialogStore = useDialogStore();
const notificationStore = useNotificationStore();

const currentPath = ref<string | null>(null);
const content = ref('');
const isDirty = ref(false);
const fontSize = ref(14);
const wordWrap = ref(true);

const fileName = computed(() => {
  if (!currentPath.value) return '未命名.txt';
  return currentPath.value.split('/').pop() ?? '未命名';
});

const stats = computed(() => {
  const text = content.value;
  return {
    chars: text.length,
    lines: text.split('\n').length,
    words: text.trim() ? text.trim().split(/\s+/).length : 0,
  };
});

watch(content, () => { isDirty.value = true; });

async function openFile() {
  const result = await dialogStore.open('prompt', {
    title: '打开文件',
    message: '请输入文件路径（例如 /notes/test.txt）',
    placeholder: '/path/to/file.txt',
    okText: '打开',
    cancelText: '取消',
  });
  if (!result.confirmed || !result.value?.trim()) return;
  try {
    const path = result.value.trim();
    const text = await vfs.readText(path);
    currentPath.value = path;
    content.value = text;
    isDirty.value = false;
    notificationStore.pushNotification({ title: '已打开', body: path, type: 'info', source: 'editor', persistent: false });
  } catch (e) {
    notificationStore.pushNotification({ title: '打开失败', body: e instanceof Error ? e.message : String(e), type: 'error', source: 'editor', persistent: false });
  }
}

async function saveFile() {
  let path = currentPath.value;
  if (!path) {
    const result = await dialogStore.open('prompt', {
      title: '保存为',
      message: '请输入文件路径',
      placeholder: '/path/to/file.txt',
      okText: '保存',
      cancelText: '取消',
    });
    if (!result.confirmed || !result.value?.trim()) return;
    path = result.value.trim();
    currentPath.value = path;
  }
  try {
    await vfs.writeText(path, content.value);
    isDirty.value = false;
    notificationStore.pushNotification({ title: '已保存', body: path, type: 'success', source: 'editor', persistent: false });
  } catch (e) {
    notificationStore.pushNotification({ title: '保存失败', body: e instanceof Error ? e.message : String(e), type: 'error', source: 'editor', persistent: false });
  }
}

function newFile() {
  if (isDirty.value && !confirm('有未保存的更改，确定新建？')) return;
  currentPath.value = null;
  content.value = '';
  isDirty.value = false;
}

onMounted(() => {
  content.value = '';
});
</script>

<template>
  <div class="editor">
    <div class="editor__toolbar">
      <button class="ed-btn" @click="newFile" title="新建">📄 新建</button>
      <button class="ed-btn" @click="openFile" title="打开">📂 打开</button>
      <button class="ed-btn ed-btn--primary" @click="saveFile" title="保存" :disabled="!isDirty && !currentPath">
        💾 保存
      </button>
      <span class="editor__name" :class="{ 'editor__name--dirty': isDirty }">
        {{ fileName }}{{ isDirty ? ' •' : '' }}
      </span>
      <div class="editor__toolbar-right">
        <button class="ed-btn ed-btn--sm" @click="fontSize = Math.max(10, fontSize - 1)" title="缩小">A-</button>
        <span class="editor__font-size">{{ fontSize }}px</span>
        <button class="ed-btn ed-btn--sm" @click="fontSize = Math.min(24, fontSize + 1)" title="放大">A+</button>
        <button class="ed-btn ed-btn--sm" :class="{ 'ed-btn--active': wordWrap }" @click="wordWrap = !wordWrap" title="换行">
          ↩
        </button>
      </div>
    </div>
    <textarea
      v-model="content"
      class="editor__textarea"
      :style="{ fontSize: fontSize + 'px', whiteSpace: wordWrap ? 'pre-wrap' : 'pre' }"
      spellcheck="false"
      placeholder="在此输入文本..."
    ></textarea>
    <div class="editor__statusbar">
      <span>{{ stats.lines }} 行</span>
      <span>{{ stats.chars }} 字符</span>
      <span>{{ stats.words }} 词</span>
      <span>{{ currentPath || '未保存' }}</span>
    </div>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.editor__toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  background: var(--ditto-color-surface-raised, #f8fafc);
}

.ed-btn {
  padding: 6px 10px;
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 6px;
  background: var(--ditto-color-surface-base, #fff);
  cursor: pointer;
  font-size: 12px;
  color: var(--ditto-color-text-primary, #0f172a);
  transition: background 120ms;
}

.ed-btn:hover:not(:disabled) {
  background: var(--ditto-color-primary-50, #eff6ff);
}

.ed-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.ed-btn--primary {
  background: var(--ditto-color-primary-500, #3b82f6);
  color: white;
  border-color: transparent;
}

.ed-btn--primary:hover:not(:disabled) {
  background: var(--ditto-color-primary-600, #2563eb);
}

.ed-btn--sm {
  padding: 4px 8px;
  font-size: 11px;
}

.ed-btn--active {
  background: var(--ditto-color-primary-100, #dbeafe);
  border-color: var(--ditto-color-primary-500, #3b82f6);
}

.editor__name {
  margin-left: 8px;
  font-size: 13px;
  color: var(--ditto-color-text-secondary, #475569);
  font-weight: 500;
}

.editor__name--dirty {
  color: var(--ditto-color-semantic-warning, #f59e0b);
}

.editor__toolbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

.editor__font-size {
  font-size: 11px;
  color: var(--ditto-color-text-secondary, #475569);
  min-width: 32px;
  text-align: center;
}

.editor__textarea {
  flex: 1;
  border: none;
  outline: none;
  resize: none;
  padding: 12px 16px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  background: var(--ditto-color-surface-base, #fff);
  color: var(--ditto-color-text-primary, #0f172a);
  line-height: 1.6;
  overflow: auto;
}

.editor__statusbar {
  display: flex;
  gap: 16px;
  padding: 4px 12px;
  border-top: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  background: var(--ditto-color-surface-raised, #f8fafc);
  font-size: 11px;
  color: var(--ditto-color-text-secondary, #475569);
}
</style>
