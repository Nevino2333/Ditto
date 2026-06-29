<script setup lang="ts">
/**
 * DIcon - 统一图标渲染组件
 *
 * 三种渲染模式（自动识别）：
 * 1. FontAwesome class：以 'fa-' 开头（如 'fa-solid fa-folder'）→ <i :class>
 * 2. URL / data URI：以 'http' / 'data:' 开头，或以 .svg/.png/.webp 结尾 → <img :src>
 * 3. emoji / 文本：其他情况 → <span> 文本渲染（向后兼容）
 *
 * 大小通过 size prop 控制（默认 1em，跟随父元素 font-size）。
 */
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  name: string;
  size?: string | number;
  title?: string;
}>(), {
  size: '1em',
  title: '',
});

function isFontAwesomeClass(name: string): boolean {
  // 匹配 'fa-solid fa-folder' / 'fa-folder' / 'fa-brands fa-github' 等
  return /^fa-(solid|regular|brands|thin|light|duotone)\s+/.test(name)
    || /^fa-[a-z0-9-]+$/.test(name.trim());
}

function isImageSource(name: string): boolean {
  return /^(https?:|data:|\/|\.\/|\.\.\/)/.test(name)
    || /\.(svg|png|webp|jpg|jpeg|gif)$/i.test(name);
}

const isFa = computed(() => isFontAwesomeClass(props.name));
const isImg = computed(() => !isFa.value && isImageSource(props.name));

const fontSizeStyle = computed(() => {
  const s = typeof props.size === 'number' ? `${props.size}px` : props.size;
  return { fontSize: s };
});
</script>

<template>
  <i
    v-if="isFa"
    :class="['d-icon', 'd-icon--fa', name]"
    :style="fontSizeStyle"
    :title="title || undefined"
    aria-hidden="true"
  />
  <img
    v-else-if="isImg"
    :class="['d-icon', 'd-icon--img']"
    :src="name"
    :style="fontSizeStyle"
    :alt="title || ''"
  />
  <span
    v-else
    :class="['d-icon', 'd-icon--emoji']"
    :style="fontSizeStyle"
    :title="title || undefined"
    aria-hidden="true"
  >{{ name }}</span>
</template>

<style scoped>
.d-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  vertical-align: middle;
  font-style: normal;
  font-weight: normal;
  font-variant: normal;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

.d-icon--fa {
  font-family: "Font Awesome 6 Free", "Font Awesome 6 Brands";
  font-weight: 900;
}

.d-icon--img {
  width: 1em;
  height: 1em;
  object-fit: contain;
}

.d-icon--emoji {
  user-select: none;
}
</style>
