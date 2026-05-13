import { ref } from 'vue';

interface DialogOptions {
  title: string;
  message?: string;
  okText?: string;
  cancelText?: string;
  placeholder?: string;
  defaultValue?: string;
}

interface DialogResult {
  confirmed: boolean;
  value?: string;
}

export function useDialog() {
  const visible = ref(false);
  const dialogType = ref<'alert' | 'confirm' | 'prompt' | 'file-open'>('alert');
  const dialogTitle = ref('');
  const dialogMessage = ref('');
  const dialogOkText = ref('OK');
  const dialogCancelText = ref('Cancel');
  const dialogPlaceholder = ref('');
  const dialogDefaultValue = ref('');

  let resolveDialog: ((result: DialogResult) => void) | null = null;

  function alert(options: DialogOptions): Promise<DialogResult> {
    return openDialog('alert', options);
  }

  function confirm(options: DialogOptions): Promise<DialogResult> {
    return openDialog('confirm', options);
  }

  function prompt(options: DialogOptions): Promise<DialogResult> {
    return openDialog('prompt', options);
  }

  function openDialog(type: 'alert' | 'confirm' | 'prompt' | 'file-open', options: DialogOptions): Promise<DialogResult> {
    dialogType.value = type;
    dialogTitle.value = options.title;
    dialogMessage.value = options.message ?? '';
    dialogOkText.value = options.okText ?? 'OK';
    dialogCancelText.value = options.cancelText ?? 'Cancel';
    dialogPlaceholder.value = options.placeholder ?? '';
    dialogDefaultValue.value = options.defaultValue ?? '';
    visible.value = true;

    return new Promise((resolve) => {
      resolveDialog = resolve;
    });
  }

  function handleOk(value?: string) {
    visible.value = false;
    resolveDialog?.({ confirmed: true, value });
    resolveDialog = null;
  }

  function handleCancel() {
    visible.value = false;
    resolveDialog?.({ confirmed: false });
    resolveDialog = null;
  }

  return {
    visible,
    dialogType,
    dialogTitle,
    dialogMessage,
    dialogOkText,
    dialogCancelText,
    dialogPlaceholder,
    dialogDefaultValue,
    alert,
    confirm,
    prompt,
    handleOk,
    handleCancel,
  };
}

export type { DialogOptions, DialogResult };
