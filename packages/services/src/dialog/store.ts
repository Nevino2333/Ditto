import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useDialogStore = defineStore('ditto-dialog', () => {
  const visible = ref(false);
  const type = ref<'alert' | 'confirm' | 'prompt' | 'file-open'>('alert');
  const title = ref('');
  const message = ref('');
  const okText = ref('OK');
  const cancelText = ref('Cancel');
  const placeholder = ref('');
  const defaultValue = ref('');

  let resolveFn: ((result: { confirmed: boolean; value?: string }) => void) | null = null;

  function open(
    dialogType: 'alert' | 'confirm' | 'prompt' | 'file-open',
    options: {
      title: string;
      message?: string;
      okText?: string;
      cancelText?: string;
      placeholder?: string;
      defaultValue?: string;
    },
  ): Promise<{ confirmed: boolean; value?: string }> {
    type.value = dialogType;
    title.value = options.title;
    message.value = options.message ?? '';
    okText.value = options.okText ?? 'OK';
    cancelText.value = options.cancelText ?? 'Cancel';
    placeholder.value = options.placeholder ?? '';
    defaultValue.value = options.defaultValue ?? '';
    visible.value = true;

    return new Promise((resolve) => {
      resolveFn = resolve;
    });
  }

  function confirm(): void {
    visible.value = false;
    resolveFn?.({ confirmed: true });
    resolveFn = null;
  }

  function confirmWithValue(value: string): void {
    visible.value = false;
    resolveFn?.({ confirmed: true, value });
    resolveFn = null;
  }

  function cancel(): void {
    visible.value = false;
    resolveFn?.({ confirmed: false });
    resolveFn = null;
  }

  return {
    visible,
    type,
    title,
    message,
    okText,
    cancelText,
    placeholder,
    defaultValue,
    open,
    confirm,
    confirmWithValue,
    cancel,
  };
});
