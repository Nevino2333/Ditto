<script setup lang="ts">
</script>

<template>
  <div class="about-app">
    <div class="about-app__header">
      <span class="about-app__logo">🦎</span>
      <h1 class="about-app__name">Ditto</h1>
      <p class="about-app__version">v0.1.0</p>
    </div>
    <p class="about-app__tagline">Your Web, Your OS</p>
    <p class="about-app__desc">
      Ditto 是一个开源的、通用的 WebOS 框架。<br/>
      让任何人都能在浏览器中构建属于自己的桌面级应用生态。
    </p>
    <div class="about-app__info">
      <div class="about-app__info-row">
        <span>框架</span><span>Vue 3 + Vite + TypeScript</span>
      </div>
      <div class="about-app__info-row">
        <span>状态管理</span><span>Pinia</span>
      </div>
      <div class="about-app__info-row">
        <span>许可证</span><span>MIT License</span>
      </div>
      <div class="about-app__info-row">
        <span>浏览器支持</span><span>Chrome 78+</span>
      </div>
    </div>
    <p class="about-app__footer">
      Made with ❤️ by the Ditto Community
    </p>
  </div>
</template>

<style scoped>
.about-app {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 24px;
  text-align: center;
  gap: 8px;
}

.about-app__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.about-app__logo {
  font-size: 48px;
  line-height: 1;
  margin-bottom: 4px;
}

.about-app__name {
  font-size: 24px;
  font-weight: 700;
  color: var(--ditto-color-text-primary, #0f172a);
  margin: 0;
}

.about-app__version {
  font-size: 13px;
  color: var(--ditto-color-text-secondary, #475569);
  margin: 0;
}

.about-app__tagline {
  font-size: 14px;
  color: var(--ditto-color-primary-500, #3b82f6);
  font-weight: 500;
  margin: 4px 0;
}

.about-app__desc {
  font-size: 13px;
  color: var(--ditto-color-text-secondary, #475569);
  line-height: 1.6;
  max-width: 320px;
  margin: 4px 0 12px;
}

.about-app__info {
  width: 100%;
  max-width: 280px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.about-app__info-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 4px 0;
  border-bottom: 1px solid var(--ditto-color-border-subtle, #e2e8f0);
}

.about-app__info-row span:first-child {
  color: var(--ditto-color-text-secondary, #475569);
}

.about-app__info-row span:last-child {
  color: var(--ditto-color-text-primary, #0f172a);
  font-weight: 500;
}

.about-app__footer {
  margin-top: 16px;
  font-size: 11px;
  color: var(--ditto-color-text-disabled, #94a3b8);
}
</style>
