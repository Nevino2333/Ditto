<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue';
import { getVFS } from '@ditto/services';

interface Line { type: 'input' | 'output' | 'error' | 'system'; text: string }

const vfs = getVFS();
const lines = ref<Line[]>([]);
const input = ref('');
const cwd = ref('/');
const history = ref<string[]>([]);
const historyIndex = ref(-1);
const scrollEl = ref<HTMLDivElement | null>(null);

const HELP = `可用命令：
  ls [path]          列出目录
  cd <path>          切换目录
  pwd                显示当前目录
  cat <file>         查看文件内容
  mkdir <name>       新建目录
  touch <name>       新建空文件
  write <file> <text> 写入文本到文件
  rm <path>          删除文件/目录
  echo <text>        回显文本
  clear              清屏
  help               显示帮助
  date               显示当前时间`;

function print(text: string, type: Line['type'] = 'output') {
  lines.value.push({ type, text });
}

function prompt(): string {
  return `${cwd.value} $`;
}

async function run(cmd: string) {
  print(`${prompt()} ${cmd}`, 'input');
  const trimmed = cmd.trim();
  if (!trimmed) return;
  history.value.push(trimmed);
  historyIndex.value = history.value.length;

  const parts = trimmed.split(/\s+/);
  const c = parts[0];
  const arg = parts.slice(1).join(' ');

  try {
    switch (c) {
      case 'ls': {
        const path = arg || cwd.value;
        const target = resolvePath(path);
        const entries = await vfs.ls(target);
        if (entries.length === 0) { print('(空)', 'system'); break; }
        for (const e of entries) {
          print(`${e.type === 'directory' ? '📁' : '📄'} ${e.name}${e.type === 'directory' ? '/' : ''}`, 'output');
        }
        break;
      }
      case 'cd': {
        if (!arg) { cwd.value = '/'; break; }
        const target = resolvePath(arg);
        try {
          const entries = await vfs.ls(target);
          if (entries !== undefined) cwd.value = target === '' ? '/' : target;
        } catch { print(`cd: 无法访问 "${arg}"`, 'error'); }
        break;
      }
      case 'pwd': print(cwd.value, 'output'); break;
      case 'cat': {
        if (!arg) { print('用法: cat <file>', 'error'); break; }
        const text = await vfs.readText(resolvePath(arg));
        print(text || '(空文件)', 'output');
        break;
      }
      case 'mkdir': {
        if (!arg) { print('用法: mkdir <name>', 'error'); break; }
        await vfs.mkdir(resolvePath(arg));
        print(`已创建目录 ${arg}`, 'system');
        break;
      }
      case 'touch': {
        if (!arg) { print('用法: touch <name>', 'error'); break; }
        await vfs.writeText(resolvePath(arg), '');
        print(`已创建文件 ${arg}`, 'system');
        break;
      }
      case 'write': {
        const m = arg.match(/^(\S+)\s+(.*)$/);
        if (!m) { print('用法: write <file> <text>', 'error'); break; }
        await vfs.writeText(resolvePath(m[1]), m[2]);
        print(`已写入 ${m[1]}`, 'system');
        break;
      }
      case 'rm': {
        if (!arg) { print('用法: rm <path>', 'error'); break; }
        await vfs.delete(resolvePath(arg));
        print(`已删除 ${arg}`, 'system');
        break;
      }
      case 'echo': print(arg, 'output'); break;
      case 'clear': lines.value = []; break;
      case 'help': print(HELP, 'system'); break;
      case 'date': print(new Date().toLocaleString('zh-CN'), 'output'); break;
      default: print(`命令未找到: ${c}（输入 help 查看可用命令）`, 'error');
    }
  } catch (e) {
    print(`错误: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

function resolvePath(p: string): string {
  if (p.startsWith('/')) return p;
  if (p === '..') {
    const parts = cwd.value.split('/').filter(Boolean);
    parts.pop();
    return '/' + parts.join('/');
  }
  if (p === '.') return cwd.value;
  return cwd.value === '/' ? `/${p}` : `${cwd.value}/${p}`;
}

async function onSubmit() {
  const cmd = input.value;
  input.value = '';
  await run(cmd);
  await nextTick();
  scrollToBottom();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (historyIndex.value > 0) {
      historyIndex.value--;
      input.value = history.value[historyIndex.value] ?? '';
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (historyIndex.value < history.value.length - 1) {
      historyIndex.value++;
      input.value = history.value[historyIndex.value] ?? '';
    } else {
      historyIndex.value = history.value.length;
      input.value = '';
    }
  }
}

function scrollToBottom() {
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
}

onMounted(() => {
  print('Ditto Terminal v0.1.0', 'system');
  print('输入 help 查看可用命令', 'system');
  print('', 'output');
});
</script>

<template>
  <div class="terminal" @click="($refs.inputEl as HTMLInputElement)?.focus()" ref="rootEl">
    <div class="terminal__output" ref="scrollEl">
      <div
        v-for="(line, i) in lines"
        :key="i"
        class="terminal__line"
        :class="`terminal__line--${line.type}`"
      >{{ line.text }}</div>
    </div>
    <div class="terminal__input-line">
      <span class="terminal__prompt">{{ prompt() }}</span>
      <input
        ref="inputEl"
        v-model="input"
        class="terminal__input"
        type="text"
        autocomplete="off"
        spellcheck="false"
        @keydown.enter="onSubmit"
        @keydown="onKeydown"
      />
    </div>
  </div>
</template>

<style scoped>
.terminal {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f172a;
  color: #e2e8f0;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  padding: 8px;
  overflow: hidden;
}

.terminal__output {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
  white-space: pre-wrap;
  word-break: break-all;
}

.terminal__line {
  line-height: 1.5;
  padding: 1px 0;
}

.terminal__line--input {
  color: #94a3b8;
}

.terminal__line--output {
  color: #e2e8f0;
}

.terminal__line--error {
  color: #f87171;
}

.terminal__line--system {
  color: #60a5fa;
}

.terminal__input-line {
  display: flex;
  align-items: center;
  padding: 4px;
  border-top: 1px solid #1e293b;
}

.terminal__prompt {
  color: #34d399;
  margin-right: 8px;
  white-space: nowrap;
}

.terminal__input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #e2e8f0;
  font-family: inherit;
  font-size: inherit;
  caret-color: #34d399;
}
</style>
