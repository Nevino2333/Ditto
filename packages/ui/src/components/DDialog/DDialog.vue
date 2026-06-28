<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue';

const props = withDefaults(defineProps<{
  visible: boolean;
  type?: 'alert' | 'confirm' | 'prompt' | 'file-open';
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  okText?: string;
  cancelText?: string;
  overlay?: boolean;
  closeOnOverlay?: boolean;
}>(), {
  type: 'alert',
  message: '',
  placeholder: '',
  defaultValue: '',
  okText: 'OK',
  cancelText: 'Cancel',
  overlay: true,
  closeOnOverlay: false,
});

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'ok', value?: string): void;
  (e: 'cancel'): void;
  (e: 'close'): void;
}>();

const promptValue = ref('');
const fileSelected = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

const isPrompt = computed(() => props.type === 'prompt');
const isFileOpen = computed(() => props.type === 'file-open');
const showCancel = computed(() => props.type === 'confirm' || props.type === 'prompt' || props.type === 'file-open');

const mockFiles = computed(() => [
  { name: 'Documents', type: 'folder' as const },
  { name: 'Pictures', type: 'folder' as const },
  { name: 'readme.txt', type: 'file' as const },
  { name: 'config.json', type: 'file' as const },
  { name: 'notes.md', type: 'file' as const },
]);

watch(() => props.visible, (val) => {
  if (val) {
    promptValue.value = props.defaultValue;
    fileSelected.value = '';
    nextTick(() => {
      if (isPrompt.value && inputRef.value) {
        inputRef.value.focus();
      }
    });
  }
});

function onOk() {
  if (isPrompt.value) {
    emit('ok', promptValue.value);
  } else if (isFileOpen.value) {
    emit('ok', fileSelected.value);
  } else {
    emit('ok');
  }
  close();
}

function onCancel() {
  emit('cancel');
  close();
}

function close() {
  emit('update:visible', false);
  emit('close');
}

function onOverlayClick() {
  if (props.closeOnOverlay) {
    onCancel();
  }
}

function onFileSelect(name: string) {
  fileSelected.value = name;
}

function onFileDblClick(name: string) {
  fileSelected.value = name;
  onOk();
}

function onKeydown(e: KeyboardEvent) {
  if (!props.visible) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    onOk();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    onCancel();
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="d-dialog">
      <div v-if="visible" class="d-dialog-overlay" :class="{ 'd-dialog-overlay--transparent': !overlay }" @click="onOverlayClick">
        <div class="d-dialog" @click.stop>
          <div class="d-dialog__titlebar">
            <span class="d-dialog__title">{{ title }}</span>
            <button class="d-dialog__close" @click="onCancel">
              <svg width="10" height="10" viewBox="0 0 10 10">
                <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.2"/>
                <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.2"/>
              </svg>
            </button>
          </div>

          <div class="d-dialog__body">
            <p v-if="message" class="d-dialog__message">{{ message }}</p>

            <div v-if="isPrompt" class="d-dialog__input-wrapper">
              <input
                ref="inputRef"
                v-model="promptValue"
                class="d-dialog__input"
                :placeholder="placeholder"
                @keydown.enter="onOk"
              />
            </div>

            <div v-if="isFileOpen" class="d-dialog__file-list">
              <div
                v-for="file in mockFiles"
                :key="file.name"
                class="d-dialog__file-item"
                :class="{ 'd-dialog__file-item--selected': fileSelected === file.name }"
                @click="onFileSelect(file.name)"
                @dblclick="onFileDblClick(file.name)"
              >
                <span class="d-dialog__file-icon">{{ file.type === 'folder' ? '📁' : '📄' }}</span>
                <span class="d-dialog__file-name">{{ file.name }}</span>
              </div>
            </div>
          </div>

          <div class="d-dialog__actions">
            <button v-if="showCancel" class="d-dialog__btn d-dialog__btn--cancel" @click="onCancel">
              {{ cancelText }}
            </button>
            <button class="d-dialog__btn d-dialog__btn--ok" @click="onOk">
              {{ okText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.d-dialog-overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 9800;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
}

.d-dialog-overlay--transparent {
  background: transparent;
  backdrop-filter: none;
}

.d-dialog {
  width: calc(100% - 32px);
  max-width: 480px;
  background: var(--ditto-color-surface-overlay, #fff);
  border: 1px solid var(--ditto-color-border-subtle, rgba(0, 0, 0, 0.06));
  border-radius: var(--ditto-radius-window, 10px);
  box-shadow: var(--ditto-shadow-windowFocused, 0 8px 32px rgba(0, 0, 0, 0.12));
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.d-dialog__titlebar {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 12px;
  gap: 8px;
  background: var(--ditto-color-window-titlebar, #f8fafc);
  border-bottom: 1px solid var(--ditto-color-border-subtle, rgba(0, 0, 0, 0.06));
  flex-shrink: 0;
  user-select: none;
  -webkit-user-select: none;
}

.d-dialog__title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--ditto-color-text-primary, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.d-dialog__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
  color: var(--ditto-color-text-secondary, #64748b);
  transition: background 100ms, color 100ms;
  flex-shrink: 0;
}

.d-dialog__close:hover {
  background: var(--ditto-color-semantic-error, #ef4444);
  color: #fff;
}

.d-dialog__body {
  padding: 20px 20px 16px;
  flex: 1;
  overflow: auto;
}

.d-dialog__message {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--ditto-color-text-primary, #0f172a);
  word-break: break-word;
}

.d-dialog__input-wrapper {
  margin-top: 12px;
}

.d-dialog__input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 6px;
  background: var(--ditto-color-surface, #fff);
  color: var(--ditto-color-text-primary, #0f172a);
  font-size: 14px;
  outline: none;
  transition: border-color 150ms, box-shadow 150ms;
  box-sizing: border-box;
}

.d-dialog__input:focus {
  border-color: var(--ditto-color-primary-400, #60a5fa);
  box-shadow: 0 0 0 3px var(--ditto-color-primary-100, rgba(96, 165, 250, 0.2));
}

.d-dialog__input::placeholder {
  color: var(--ditto-color-text-disabled, #94a3b8);
}

.d-dialog__file-list {
  margin-top: 8px;
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
  border-radius: 6px;
  overflow: hidden;
  max-height: 240px;
  overflow-y: auto;
}

.d-dialog__file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 80ms;
  font-size: 13px;
  color: var(--ditto-color-text-primary, #0f172a);
}

.d-dialog__file-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.d-dialog__file-item--selected {
  background: var(--ditto-color-primary-50, rgba(59, 130, 246, 0.08));
}

.d-dialog__file-item--selected:hover {
  background: var(--ditto-color-primary-100, rgba(59, 130, 246, 0.14));
}

.d-dialog__file-icon {
  font-size: 16px;
  line-height: 1;
  flex-shrink: 0;
}

.d-dialog__file-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.d-dialog__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px 16px;
  flex-shrink: 0;
}

.d-dialog__btn {
  height: 34px;
  padding: 0 20px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 100ms, opacity 100ms, transform 80ms;
  outline: none;
}

.d-dialog__btn:active {
  transform: scale(0.97);
}

.d-dialog__btn--cancel {
  background: var(--ditto-color-surface, #f1f5f9);
  color: var(--ditto-color-text-secondary, #475569);
  border: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
}

.d-dialog__btn--cancel:hover {
  background: var(--ditto-color-border-subtle, #e2e8f0);
}

.d-dialog__btn--ok {
  background: var(--ditto-color-primary-500, #3b82f6);
  color: #fff;
}

.d-dialog__btn--ok:hover {
  background: var(--ditto-color-primary-600, #2563eb);
}

.d-dialog-enter-active {
  animation: d-dialog-in 200ms cubic-bezier(0.175, 0.885, 0.32, 1.1);
}

.d-dialog-leave-active {
  animation: d-dialog-out 150ms ease-in;
}

@keyframes d-dialog-in {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes d-dialog-out {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.92);
  }
}

@media (pointer: coarse) {
  .d-dialog__titlebar {
    height: 48px;
  }

  .d-dialog__close {
    width: 34px;
    height: 34px;
  }

  .d-dialog__btn {
    height: 40px;
    padding: 0 24px;
    font-size: 14px;
  }

  .d-dialog__input {
    height: 42px;
    font-size: 16px;
  }

  .d-dialog__file-item {
    padding: 12px 14px;
  }
}

@media (max-width: 480px) {
  .d-dialog__body {
    padding: 16px;
  }

  .d-dialog__actions {
    padding: 8px 16px 14px;
  }

  .d-dialog__btn {
    flex: 1;
  }
}
</style>
