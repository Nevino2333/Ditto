<template>
  <div class="market">
    <aside class="market__sidebar">
      <div class="market__sidebar-header">
        <span class="market__logo">🦎</span>
        <span class="market__title">Ditto Market</span>
      </div>
      <nav class="market__nav">
        <button
          v-for="item in navItems"
          :key="item.view + (item.category ?? '')"
          :class="['market__nav-item', { 'market__nav-item--active': isNavActive(item) }]"
          @click="handleNav(item)"
        >
          <span class="market__nav-icon">{{ item.icon }}</span>
          <span class="market__nav-label">{{ item.label }}</span>
          <span v-if="item.view === 'updates' && store.updatesAvailable.length" class="market__nav-badge">
            {{ store.updatesAvailable.length }}
          </span>
        </button>
      </nav>
      <div class="market__sidebar-footer">
        <span class="market__version">v0.1.0</span>
      </div>
    </aside>

    <main class="market__content">
      <div v-if="store.loading && store.currentView !== 'detail'" class="market__loading">
        <div class="market__spinner"></div>
        <span>加载中...</span>
      </div>

      <div v-else-if="store.error && store.currentView !== 'detail'" class="market__error">
        <span>❌ {{ store.error }}</span>
        <button class="m-btn m-btn--primary" @click="retry">重试</button>
      </div>

      <template v-else-if="store.currentView === 'home'">
        <div class="market__search-bar">
          <input
            type="text"
            class="m-search"
            placeholder="搜索应用..."
            :value="store.searchQuery"
            @input="store.setSearch(sanitizeInput(($event.target as HTMLInputElement).value))"
            @keyup.enter="goSearch"
          />
        </div>

        <section v-if="store.featured?.banner?.length" class="market__section">
          <div class="market__carousel">
            <div class="market__carousel-track" :style="{ transform: `translateX(-${bannerIndex * 100}%)` }">
              <div
                v-for="(banner, bi) in store.featured!.banner"
                :key="bi"
                class="market__banner"
                @click="goToDetail(banner.appId)"
              >
                <div class="market__banner-overlay">
                  <h2>{{ banner.title }}</h2>
                  <p>{{ banner.subtitle }}</p>
                </div>
              </div>
            </div>
            <div v-if="store.featured!.banner.length > 1" class="market__carousel-dots">
              <button
                v-for="(_, di) in store.featured!.banner"
                :key="di"
                :class="['market__carousel-dot', { 'market__carousel-dot--active': bannerIndex === di }]"
                @click="bannerIndex = di"
              ></button>
            </div>
          </div>
        </section>

        <section v-if="store.featured?.editorsChoice?.length" class="market__section">
          <h3 class="market__section-title">✨ 编辑精选</h3>
          <div class="market__card-row">
            <div
              v-for="appId in store.featured!.editorsChoice.slice(0, 6)"
              :key="appId"
              class="m-card"
              @click="goToDetail(appId)"
            >
              <div class="m-card__icon">{{ getAppEntry(appId)?.manifest.icon ?? '📦' }}</div>
              <div class="m-card__info">
                <div class="m-card__name">{{ getAppEntry(appId)?.manifest.name ?? appId }}</div>
                <div class="m-card__summary">{{ getAppEntry(appId)?.market.summary ?? '' }}</div>
                <div class="m-card__meta">
                  <m-rating :value="getAppEntry(appId)?.rating ?? 0" />
                  <span class="m-card__rating-num">{{ (getAppEntry(appId)?.rating ?? 0).toFixed(1) }}</span>
                </div>
              </div>
              <button
                class="m-btn m-btn--sm"
                :class="store.isInstalled(appId) ? 'm-btn--installed' : 'm-btn--primary'"
                @click.stop="handleAppAction(appId)"
              >
                {{ store.isInstalled(appId) ? '打开' : '安装' }}
              </button>
            </div>
          </div>
        </section>

        <section v-if="store.featured?.newApps?.length" class="market__section">
          <h3 class="market__section-title">🆕 新上架</h3>
          <div class="market__card-row">
            <div
              v-for="appId in store.featured!.newApps.slice(0, 6)"
              :key="appId"
              class="m-card"
              @click="goToDetail(appId)"
            >
              <div class="m-card__icon">{{ getAppEntry(appId)?.manifest.icon ?? '📦' }}</div>
              <div class="m-card__info">
                <div class="m-card__name">{{ getAppEntry(appId)?.manifest.name ?? appId }}</div>
                <div class="m-card__summary">{{ getAppEntry(appId)?.market.summary ?? '' }}</div>
              </div>
              <m-badge type="new" />
            </div>
          </div>
        </section>

        <section v-if="store.featured?.topRated?.length" class="market__section">
          <h3 class="market__section-title">⭐ 最高评分</h3>
          <div class="market__card-row">
            <div
              v-for="appId in store.featured!.topRated.slice(0, 6)"
              :key="appId"
              class="m-card"
              @click="goToDetail(appId)"
            >
              <div class="m-card__icon">{{ getAppEntry(appId)?.manifest.icon ?? '📦' }}</div>
              <div class="m-card__info">
                <div class="m-card__name">{{ getAppEntry(appId)?.manifest.name ?? appId }}</div>
                <div class="m-card__meta">
                  <m-rating :value="getAppEntry(appId)?.rating ?? 0" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="market__section">
          <h3 class="market__section-title">📂 浏览分类</h3>
          <div class="market__category-grid">
            <button
              v-for="cat in store.categories"
              :key="cat.id"
              class="market__category-card"
              @click="browseCategory(cat.id)"
            >
              <span class="market__category-icon">{{ cat.icon }}</span>
              <span class="market__category-name">{{ cat.name }}</span>
            </button>
          </div>
        </section>

        <section class="market__section market__section--cta">
          <div class="market__cta">
            <span class="market__cta-icon">🚀</span>
            <div class="market__cta-text">
              <h3>探索更多应用</h3>
              <p>浏览全部 {{ store.appList.length }} 款应用</p>
            </div>
            <button class="m-btn m-btn--primary" @click="store.navigate('apps'); store.setCategory(null); store.fetchApps()">浏览全部</button>
          </div>
        </section>
      </template>

      <template v-else-if="store.currentView === 'apps'">
        <div class="market__toolbar">
          <input
            type="text"
            class="m-search"
            placeholder="搜索应用..."
            :value="store.searchQuery"
            @input="store.setSearch(sanitizeInput(($event.target as HTMLInputElement).value))"
            @keyup.enter="store.fetchApps()"
          />
          <div class="market__sort">
            <button
              v-for="s in sortOptions"
              :key="s.value"
              :class="['m-btn m-btn--sm', { 'm-btn--primary': store.sortBy === s.value }]"
              @click="store.setSort(s.value)"
            >{{ s.label }}</button>
          </div>
        </div>
        <div class="market__tags">
          <button
            :class="['m-tag', { 'm-tag--active': !store.selectedCategory }]"
            @click="store.setCategory(null)"
          >全部</button>
          <button
            v-for="cat in store.categories"
            :key="cat.id"
            :class="['m-tag', { 'm-tag--active': store.selectedCategory === cat.id }]"
            @click="store.setCategory(cat.id)"
          >{{ cat.icon }} {{ cat.name }}</button>
        </div>
        <div class="market__grid">
          <div
            v-for="app in store.filteredApps"
            :key="app.id"
            class="m-card"
            @click="goToDetail(app.id)"
          >
            <div class="m-card__icon">{{ app.manifest.icon ?? '📦' }}</div>
            <div class="m-card__info">
              <div class="m-card__name">{{ app.manifest.name }}</div>
              <div class="m-card__summary">{{ app.market.summary }}</div>
              <div class="m-card__meta">
                <m-rating :value="app.rating" />
                <span class="m-card__rating-num">{{ app.rating.toFixed(1) }}</span>
                <span class="m-card__category">{{ getCategoryName(app.market.category) }}</span>
              </div>
            </div>
            <button
              class="m-btn m-btn--sm"
              :class="store.isInstalled(app.id) ? 'm-btn--installed' : 'm-btn--primary'"
              @click.stop="handleAppAction(app.id)"
              :disabled="store.installingAppId === app.id"
            >
              {{ store.installingAppId === app.id ? '安装中...' : store.isInstalled(app.id) ? '打开' : '安装' }}
            </button>
          </div>
        </div>
        <div v-if="!store.filteredApps.length && !store.loading" class="market__empty">
          <span>🔍 没有找到匹配的应用</span>
        </div>
      </template>

      <template v-else-if="store.currentView === 'detail' && store.selectedApp">
        <button class="m-btn m-btn--ghost" @click="goBack">← 返回</button>
        <div v-if="store.error" class="market__toast">
          <span>⚠️ {{ store.error }}</span>
          <button class="m-btn m-btn--ghost m-btn--sm" @click="store.error = null">✕</button>
        </div>
        <div class="market__detail">
          <div class="market__detail-header">
            <div class="market__detail-icon">{{ store.selectedApp.manifest.icon ?? '📦' }}</div>
            <div class="market__detail-info">
              <h2>{{ store.selectedApp.manifest.name }}</h2>
              <p class="market__detail-publisher">{{ store.selectedApp.market.publisher }}</p>
              <div class="market__detail-meta">
                <m-rating :value="store.selectedApp.rating" />
                <span>{{ store.selectedApp.rating.toFixed(1) }} ({{ store.selectedApp.ratingCount }} 评分)</span>
                <span>📥 {{ store.selectedApp.downloads }} 下载</span>
                <span>v{{ store.selectedApp.manifest.version }}</span>
              </div>
            </div>
            <button
              class="m-btn m-btn--lg"
              :class="store.isInstalled(store.selectedApp.id) ? 'm-btn--installed' : 'm-btn--primary'"
              @click="handleAppAction(store.selectedApp.id)"
              :disabled="store.installingAppId === store.selectedApp.id"
            >
              {{ store.installingAppId === store.selectedApp.id ? '安装中...' : store.isInstalled(store.selectedApp.id) ? '打开' : '安装' }}
            </button>
          </div>

          <div v-if="store.selectedApp.market.screenshots?.length" class="market__screenshots">
            <div class="market__screenshot-track">
              <img
                v-for="(ss, i) in store.selectedApp.market.screenshots"
                :key="i"
                :src="`${serverUrl}/api/market/apps/${store.selectedApp.id}/screenshots/${ss.replace('screenshots/', '')}`"
                class="market__screenshot"
                @error="($event.target as HTMLElement).style.display = 'none'"
              />
            </div>
          </div>

          <div class="market__detail-body">
            <div class="market__detail-section">
              <h3>描述</h3>
              <div class="market__description" v-html="renderMarkdown(store.selectedApp.market.description)"></div>
            </div>

            <div v-if="store.selectedApp.market.tags?.length" class="market__detail-section">
              <h3>标签</h3>
              <div class="market__tags">
                <span v-for="tag in store.selectedApp.market.tags" :key="tag" class="m-tag m-tag--static">{{ tag }}</span>
              </div>
            </div>

            <div class="market__detail-section">
              <h3>评分分布</h3>
              <div class="market__rating-dist">
                <div v-for="star in [5,4,3,2,1]" :key="star" class="market__rating-bar">
                  <span class="market__rating-bar-label">{{ star }} ★</span>
                  <div class="market__rating-bar-track">
                    <div
                      class="market__rating-bar-fill"
                      :style="{ width: getRatingPercent(star) + '%' }"
                    ></div>
                  </div>
                  <span class="market__rating-bar-count">{{ getRatingCount(star) }}</span>
                </div>
              </div>
            </div>

            <div class="market__detail-section">
              <h3>评论 ({{ store.currentReviews.length }})</h3>

              <div class="market__review-form">
                <div class="market__review-form-row">
                  <m-rating :value="reviewForm.rating" :interactive="true" @rate="(r: number) => reviewForm.rating = r" />
                  <span class="market__review-form-hint">{{ reviewForm.rating > 0 ? '⭐'.repeat(reviewForm.rating) : '点击评分' }}</span>
                </div>
                <textarea
                  class="market__review-textarea"
                  v-model="reviewForm.comment"
                  placeholder="写下你的评论..."
                  rows="3"
                ></textarea>
                <div class="market__review-form-actions">
                  <button
                    class="m-btn m-btn--primary m-btn--sm"
                    :disabled="!reviewForm.rating || submittingReview"
                    @click="submitReview"
                  >
                    {{ submittingReview ? '提交中...' : '提交评论' }}
                  </button>
                </div>
              </div>

              <div v-if="store.currentReviews.length" class="market__reviews">
                <div v-for="review in store.currentReviews" :key="review.userId + review.createdAt" class="m-review">
                  <div class="m-review__header">
                    <span class="m-review__user">{{ review.userId }}</span>
                    <m-rating :value="review.rating" />
                    <span class="m-review__version">v{{ review.version }}</span>
                  </div>
                  <p v-if="review.comment" class="m-review__comment">{{ review.comment }}</p>
                  <span class="m-review__date">{{ formatDate(review.createdAt) }}</span>
                </div>
              </div>
              <div v-else class="market__empty">暂无评论，来做第一个评论者吧！</div>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="store.currentView === 'installed'">
        <h2 class="market__page-title">📦 已安装应用</h2>
        <div v-if="store.installedApps.length" class="market__list">
          <div v-for="app in store.installedApps" :key="app.appId" class="m-card m-card--horizontal">
            <div class="m-card__icon">{{ app.icon ?? '📦' }}</div>
            <div class="m-card__info">
              <div class="m-card__name">{{ app.appName }}</div>
              <div class="m-card__meta">v{{ app.installedVersion }}</div>
            </div>
            <div class="m-card__actions">
              <button class="m-btn m-btn--primary m-btn--sm" @click="openApp(app.appId)">打开</button>
              <button v-if="app.hasUpdate" class="m-btn m-btn--accent m-btn--sm" @click="handleInstall(app.appId)">更新</button>
              <button class="m-btn m-btn--ghost m-btn--sm" @click="uninstallApp(app.appId)">卸载</button>
            </div>
          </div>
        </div>
        <div v-else class="market__empty">还没有安装任何应用</div>
      </template>

      <template v-else-if="store.currentView === 'updates'">
        <h2 class="market__page-title">⬆️ 可用更新</h2>
        <div v-if="store.updatesAvailable.length" class="market__list">
          <div class="market__update-header">
            <span>{{ store.updatesAvailable.length }} 个应用有更新</span>
            <button class="m-btn m-btn--primary m-btn--sm" @click="updateAll">全部更新</button>
          </div>
          <div v-for="update in store.updatesAvailable" :key="update.appId" class="m-card m-card--horizontal">
            <div class="m-card__icon">{{ update.icon ?? '📦' }}</div>
            <div class="m-card__info">
              <div class="m-card__name">{{ update.appName }}</div>
              <div class="m-card__meta">
                <span>v{{ update.currentVersion }}</span>
                <span class="market__update-arrow">→</span>
                <span class="market__update-new">v{{ update.newVersion }}</span>
              </div>
              <p v-if="update.changelog" class="m-card__changelog">{{ update.changelog }}</p>
            </div>
            <button
              class="m-btn m-btn--primary m-btn--sm"
              :disabled="store.installingAppId === update.appId"
              @click="handleInstall(update.appId)"
            >
              {{ store.installingAppId === update.appId ? '更新中...' : '更新' }}
            </button>
          </div>
        </div>
        <div v-else class="market__empty">所有应用已是最新版本 ✅</div>
      </template>

      <template v-else-if="store.currentView === 'publish'">
        <h2 class="market__page-title">📋 发布应用到 Ditto Market</h2>
        <div class="market__publish-guide">
          <div class="market__publish-step">
            <div class="market__publish-step-num">1</div>
            <div class="market__publish-step-content">
              <h3>Fork 仓库</h3>
              <p>访问 <a href="https://github.com/Nevino2233/Ditto_Market" target="_blank" rel="noopener">Nevino2233/Ditto_Market</a>，点击 Fork。</p>
            </div>
          </div>
          <div class="market__publish-step">
            <div class="market__publish-step-num">2</div>
            <div class="market__publish-step-content">
              <h3>创建应用目录</h3>
              <p>在 <code>apps/</code> 下创建以应用 ID 命名的目录（反域名格式，如 <code>com.example.myapp</code>）。</p>
            </div>
          </div>
          <div class="market__publish-step">
            <div class="market__publish-step-num">3</div>
            <div class="market__publish-step-content">
              <h3>添加 manifest.json</h3>
              <p>包含应用信息和 <code>market</code> 字段（summary、description、category、screenshots 等）。</p>
            </div>
          </div>
          <div class="market__publish-step">
            <div class="market__publish-step-num">4</div>
            <div class="market__publish-step-content">
              <h3>上传 .dit 包</h3>
              <p>使用 <code>ditto pack</code> 打包后，在 GitHub 创建 Release 并上传 .dit 文件。</p>
            </div>
          </div>
          <div class="market__publish-step">
            <div class="market__publish-step-num">5</div>
            <div class="market__publish-step-content">
              <h3>提交 PR</h3>
              <p>提交 Pull Request，管理员审核通过后应用将自动上架。</p>
            </div>
          </div>
        </div>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, reactive } from 'vue';
import { useMarketStore } from '../stores/market';
import { useAppStore } from '@ditto/services';

const store = useMarketStore();
const appStore = useAppStore();
const serverUrl = window.location.origin;

const bannerIndex = ref(0);
let bannerTimer: ReturnType<typeof setInterval> | null = null;
const submittingReview = ref(false);
const reviewForm = reactive({ rating: 0, comment: '' });
const previousView = ref<string>('home');

const navItems = [
  { view: 'home' as const, icon: '🏠', label: '首页', category: null as string | null },
  { view: 'apps' as const, icon: '📱', label: '应用', category: null as string | null },
  { view: 'apps' as const, icon: '🔌', label: '插件', category: 'plugin' as string | null },
  { view: 'apps' as const, icon: '🎨', label: '主题', category: 'theme' as string | null },
  { view: 'apps' as const, icon: '📱', label: '小组件', category: 'widget' as string | null },
  { view: 'installed' as const, icon: '📦', label: '已安装', category: null as string | null },
  { view: 'updates' as const, icon: '⬆️', label: '更新', category: null as string | null },
  { view: 'publish' as const, icon: '📋', label: '发布', category: null as string | null },
];

const sortOptions = [
  { value: 'newest' as const, label: '最新' },
  { value: 'rating' as const, label: '评分' },
  { value: 'downloads' as const, label: '下载量' },
];

onMounted(async () => {
  await Promise.all([
    store.fetchCategories(),
    store.fetchFeatured(),
    store.fetchApps(),
    store.fetchInstalled(),
    store.fetchUpdates(),
  ]);
  startBannerCarousel();
});

function startBannerCarousel() {
  if (bannerTimer) clearInterval(bannerTimer);
  bannerTimer = setInterval(() => {
    const total = store.featured?.banner?.length ?? 0;
    if (total > 1) {
      bannerIndex.value = (bannerIndex.value + 1) % total;
    }
  }, 5000);
}

function isNavActive(item: { view: string; category: string | null }): boolean {
  if (item.category) {
    return store.currentView === 'apps' && store.selectedCategory === item.category;
  }
  if (item.view === 'apps' && !item.category) {
    return store.currentView === 'apps' && !store.selectedCategory;
  }
  return store.currentView === item.view;
}

function handleNav(item: { view: string; category: string | null }) {
  if (item.category) {
    store.setCategory(item.category);
    store.navigate('apps');
  } else if (item.view === 'apps') {
    store.setCategory(null);
    store.navigate('apps');
    store.fetchApps();
  } else {
    store.navigate(item.view as any);
  }
}

function goSearch() {
  store.navigate('apps');
  store.fetchApps();
}

function browseCategory(categoryId: string) {
  store.setCategory(categoryId);
  store.navigate('apps');
}

function goBack() {
  store.navigate(previousView.value as any);
}

function retry() {
  store.error = null;
  store.fetchApps();
}

function getAppEntry(appId: string) {
  return store.apps.get(appId);
}

function getCategoryName(categoryId: string): string {
  const cat = store.categories.find(c => c.id === categoryId);
  return cat ? cat.name : categoryId;
}

function sanitizeInput(input: string): string {
  return input.replace(/[<>"'&]/g, '');
}

async function handleAppAction(appId: string) {
  if (store.isInstalled(appId)) {
    openApp(appId);
  } else {
    await handleInstall(appId);
  }
}

function openApp(appId: string) {
  appStore.launchApp(appId);
}

async function handleInstall(appId: string) {
  try {
    await store.installApp(appId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '安装失败';
    if (msg.includes('No download URL')) {
      store.error = '该应用暂不可安装（缺少下载地址），敬请期待';
    } else {
      store.error = msg;
    }
  }
}

async function uninstallApp(appId: string) {
  try {
    const res = await fetch(`${serverUrl}/api/apps/uninstall/${appId}`, { method: 'DELETE' });
    if (res.ok) await store.fetchInstalled();
  } catch {}
}

async function updateAll() {
  for (const update of store.updatesAvailable) {
    try {
      await store.installApp(update.appId);
    } catch { break; }
  }
  await store.fetchUpdates();
}

async function submitReview() {
  if (!reviewForm.rating || !store.selectedAppId) return;
  submittingReview.value = true;
  try {
    const userId = localStorage.getItem('ditto_user_id') ?? 'anonymous';
    const res = await fetch(`${serverUrl}/api/market/apps/${store.selectedAppId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
      body: JSON.stringify({ rating: reviewForm.rating, comment: reviewForm.comment }),
    });
    const data = await res.json();
    if (data.prUrl) {
      window.open(data.prUrl, '_blank', 'noopener');
    }
    reviewForm.rating = 0;
    reviewForm.comment = '';
  } catch {} finally {
    submittingReview.value = false;
  }
}

function getRatingPercent(star: number): number {
  const total = store.currentReviews.length;
  if (total === 0) return 0;
  const count = store.currentReviews.filter(r => Math.round(r.rating) === star).length;
  return Math.round((count / total) * 100);
}

function getRatingCount(star: number): number {
  return store.currentReviews.filter(r => Math.round(r.rating) === star).length;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('zh-CN');
  } catch {
    return iso;
  }
}

function renderMarkdown(text: string): string {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  html = html.replace(/---/g, '<hr>');

  html = html.replace(/\n/g, '<br>');

  html = html.replace(/<br><(h[234]|ul|blockquote|hr)/g, '<$1');
  html = html.replace(/<\/(h[234]|ul|blockquote)><br>/g, '</$1>');

  return html;
}

async function goToDetail(appId: string) {
  previousView.value = store.currentView;
  await store.fetchAppDetail(appId);
}
</script>

<script lang="ts">
import { defineComponent, h } from 'vue';

const MRating = defineComponent({
  name: 'MRating',
  props: {
    value: { type: Number, default: 0 },
    interactive: { type: Boolean, default: false },
  },
  emits: ['rate'],
  setup(props, { emit }) {
    return () => {
      const stars = [];
      for (let i = 1; i <= 5; i++) {
        const filled = i <= Math.round(props.value);
        stars.push(
          h('span', {
            class: ['m-rating__star', { 'm-rating__star--filled': filled }],
            style: props.interactive ? { cursor: 'pointer' } : {},
            onClick: props.interactive ? () => emit('rate', i) : undefined,
          }, filled ? '★' : '☆')
        );
      }
      return h('span', { class: 'm-rating' }, stars);
    };
  },
});

const MBadge = defineComponent({
  name: 'MBadge',
  props: {
    type: { type: String, default: 'new' },
  },
  setup(props) {
    const labels: Record<string, string> = { new: 'NEW', update: '更新', installed: '已安装' };
    return () => h('span', { class: `m-badge m-badge--${props.type}` }, labels[props.type] ?? props.type);
  },
});

export default { components: { MRating, MBadge } };
</script>

<style scoped>
.market {
  display: flex;
  height: 100%;
  background: var(--ditto-color-surface-base, #f8f9fa);
  color: var(--ditto-color-text-primary, #1a1a2e);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  overflow: hidden;
}

.market__sidebar {
  width: 200px;
  background: var(--ditto-color-surface-raised, #ffffff);
  border-right: 1px solid var(--ditto-color-border-subtle, #e5e5e5);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.market__sidebar-header {
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--ditto-color-border-subtle, #e5e5e5);
}

.market__logo { font-size: 24px; }

.market__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--ditto-color-text-primary, #1a1a2e);
}

.market__nav {
  flex: 1;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.market__nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--ditto-color-text-secondary, #666);
  transition: all 0.15s;
  text-align: left;
  width: 100%;
}

.market__nav-item:hover {
  background: var(--ditto-color-surface-overlay, #f0f0f0);
  color: var(--ditto-color-text-primary, #1a1a2e);
}

.market__nav-item--active {
  background: var(--ditto-color-primary-50, #e3f2fd);
  color: var(--ditto-color-primary-600, #0078d4);
  font-weight: 600;
}

.market__nav-icon { font-size: 18px; width: 24px; text-align: center; }
.market__nav-label { flex: 1; }

.market__nav-badge {
  background: var(--ditto-color-semantic-error, #e53935);
  color: white;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.market__sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--ditto-color-border-subtle, #e5e5e5);
  text-align: center;
}

.market__version {
  font-size: 12px;
  color: var(--ditto-color-text-disabled, #999);
}

.market__content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.market__search-bar { margin-bottom: 24px; }

.m-search {
  width: 100%;
  max-width: 500px;
  padding: 10px 16px;
  border: 1px solid var(--ditto-color-border-subtle, #e5e5e5);
  border-radius: 10px;
  font-size: 14px;
  background: var(--ditto-color-surface-raised, #fff);
  color: var(--ditto-color-text-primary, #1a1a2e);
  outline: none;
  transition: border-color 0.15s;
}

.m-search:focus { border-color: var(--ditto-color-primary-500, #0078d4); }
.m-search::placeholder { color: var(--ditto-color-text-disabled, #999); }

.market__section { margin-bottom: 32px; }
.market__section-title { font-size: 18px; font-weight: 700; margin-bottom: 16px; }

.market__carousel {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
}

.market__carousel-track {
  display: flex;
  transition: transform 0.5s ease;
}

.market__banner {
  min-width: 100%;
  height: 180px;
  background: linear-gradient(135deg, var(--ditto-color-primary-400, #42a5f5), var(--ditto-color-primary-700, #1565c0));
  display: flex;
  align-items: flex-end;
  padding: 24px;
  cursor: pointer;
  box-sizing: border-box;
}

.market__banner-overlay { color: white; }
.market__banner-overlay h2 { font-size: 22px; margin: 0 0 4px; }
.market__banner-overlay p { font-size: 14px; opacity: 0.9; margin: 0; }

.market__carousel-dots {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
}

.market__carousel-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  padding: 0;
  transition: all 0.2s;
}

.market__carousel-dot--active {
  background: white;
  width: 20px;
  border-radius: 4px;
}

.market__card-row {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.m-card {
  background: var(--ditto-color-surface-raised, #fff);
  border: 1px solid var(--ditto-color-border-subtle, #e5e5e5);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.15s;
  min-width: 280px;
  flex-shrink: 0;
}

.m-card:hover {
  border-color: var(--ditto-color-primary-200, #90caf9);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.m-card--horizontal { min-width: unset; width: 100%; }

.m-card__icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: var(--ditto-color-surface-overlay, #f0f0f0);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  flex-shrink: 0;
}

.m-card__info { flex: 1; min-width: 0; }
.m-card__name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.m-card__summary { font-size: 12px; color: var(--ditto-color-text-secondary, #666); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.m-card__meta { display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 12px; color: var(--ditto-color-text-secondary, #666); }
.m-card__rating-num { font-weight: 600; }
.m-card__category { color: var(--ditto-color-primary-500, #0078d4); }
.m-card__actions { display: flex; gap: 8px; flex-shrink: 0; }
.m-card__changelog { font-size: 11px; color: var(--ditto-color-text-disabled, #999); margin: 2px 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.m-btn {
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 16px;
  transition: all 0.15s;
  white-space: nowrap;
}

.m-btn--primary { background: var(--ditto-color-primary-500, #0078d4); color: white; }
.m-btn--primary:hover { background: var(--ditto-color-primary-600, #005a9e); }
.m-btn--primary:disabled { opacity: 0.6; cursor: not-allowed; }
.m-btn--accent { background: #ff9800; color: white; }
.m-btn--accent:hover { background: #f57c00; }
.m-btn--installed { background: var(--ditto-color-surface-overlay, #e8f5e9); color: #2e7d32; }
.m-btn--installed:hover { background: #c8e6c9; }
.m-btn--ghost { background: transparent; color: var(--ditto-color-text-secondary, #666); }
.m-btn--ghost:hover { background: var(--ditto-color-surface-overlay, #f0f0f0); }
.m-btn--sm { padding: 5px 12px; font-size: 12px; }
.m-btn--lg { padding: 12px 28px; font-size: 15px; }

.m-rating { display: inline-flex; gap: 1px; }
.m-rating__star { color: var(--ditto-color-text-disabled, #ccc); font-size: 14px; }
.m-rating__star--filled { color: #ffc107; }

.m-tag {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 12px;
  border: 1px solid var(--ditto-color-border-subtle, #e5e5e5);
  background: var(--ditto-color-surface-raised, #fff);
  color: var(--ditto-color-text-secondary, #666);
  cursor: pointer;
  transition: all 0.15s;
}

.m-tag--static { cursor: default; }

.m-tag--active {
  background: var(--ditto-color-primary-50, #e3f2fd);
  border-color: var(--ditto-color-primary-300, #90caf9);
  color: var(--ditto-color-primary-600, #0078d4);
}

.m-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.m-badge--new { background: #e8f5e9; color: #2e7d32; }
.m-badge--update { background: #fff3e0; color: #e65100; }
.m-badge--installed { background: #e3f2fd; color: #1565c0; }

.market__toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.market__sort { display: flex; gap: 6px; }

.market__tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }

.market__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}

.market__grid .m-card { min-width: unset; }

.market__detail { margin-top: 16px; }

.market__detail-header {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 24px;
}

.market__detail-icon {
  width: 80px;
  height: 80px;
  border-radius: 16px;
  background: var(--ditto-color-surface-overlay, #f0f0f0);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  flex-shrink: 0;
}

.market__detail-info { flex: 1; }
.market__detail-info h2 { margin: 0 0 4px; font-size: 22px; }
.market__detail-publisher { color: var(--ditto-color-text-secondary, #666); margin: 0 0 8px; }
.market__detail-meta { display: flex; align-items: center; gap: 12px; font-size: 13px; color: var(--ditto-color-text-secondary, #666); flex-wrap: wrap; }

.market__screenshots {
  margin-bottom: 24px;
  overflow-x: auto;
}

.market__screenshot-track {
  display: flex;
  gap: 12px;
}

.market__screenshot {
  height: 200px;
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid var(--ditto-color-border-subtle, #e5e5e5);
}

.market__detail-body { max-width: 700px; }

.market__detail-section { margin-bottom: 24px; }
.market__detail-section h3 { font-size: 16px; margin: 0 0 12px; }

.market__description { line-height: 1.7; color: var(--ditto-color-text-secondary, #444); }
.market__description code { background: var(--ditto-color-surface-overlay, #f0f0f0); padding: 2px 6px; border-radius: 4px; font-size: 13px; }
.market__description h2 { font-size: 18px; margin: 16px 0 8px; }
.market__description h3 { font-size: 16px; margin: 14px 0 6px; }
.market__description h4 { font-size: 15px; margin: 12px 0 6px; }
.market__description ul { padding-left: 20px; margin: 8px 0; }
.market__description li { margin: 4px 0; }
.market__description a { color: var(--ditto-color-primary-500, #0078d4); text-decoration: none; }
.market__description a:hover { text-decoration: underline; }
.market__description blockquote { border-left: 3px solid var(--ditto-color-primary-300, #90caf9); padding-left: 12px; margin: 8px 0; color: var(--ditto-color-text-secondary, #666); }
.market__description hr { border: none; border-top: 1px solid var(--ditto-color-border-subtle, #e5e5e5); margin: 16px 0; }

.market__rating-dist {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 320px;
}

.market__rating-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.market__rating-bar-label {
  width: 36px;
  text-align: right;
  color: var(--ditto-color-text-secondary, #666);
  flex-shrink: 0;
}

.market__rating-bar-track {
  flex: 1;
  height: 8px;
  background: var(--ditto-color-surface-overlay, #f0f0f0);
  border-radius: 4px;
  overflow: hidden;
}

.market__rating-bar-fill {
  height: 100%;
  background: #ffc107;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.market__rating-bar-count {
  width: 24px;
  color: var(--ditto-color-text-disabled, #999);
  flex-shrink: 0;
}

.market__review-form {
  padding: 16px;
  background: var(--ditto-color-surface-raised, #fff);
  border: 1px solid var(--ditto-color-border-subtle, #e5e5e5);
  border-radius: 10px;
  margin-bottom: 16px;
}

.market__review-form-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.market__review-form-hint {
  font-size: 12px;
  color: var(--ditto-color-text-secondary, #666);
}

.market__review-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--ditto-color-border-subtle, #e5e5e5);
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  background: var(--ditto-color-surface-base, #f8f9fa);
  color: var(--ditto-color-text-primary, #1a1a2e);
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.market__review-textarea:focus { border-color: var(--ditto-color-primary-500, #0078d4); }

.market__review-form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.market__reviews { display: flex; flex-direction: column; gap: 12px; }

.m-review {
  padding: 12px;
  border: 1px solid var(--ditto-color-border-subtle, #e5e5e5);
  border-radius: 8px;
}

.m-review__header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.m-review__user { font-weight: 600; font-size: 13px; }
.m-review__version { font-size: 12px; color: var(--ditto-color-text-disabled, #999); margin-left: auto; }
.m-review__comment { margin: 0 0 4px; font-size: 13px; line-height: 1.5; }
.m-review__date { font-size: 11px; color: var(--ditto-color-text-disabled, #999); }

.market__list { display: flex; flex-direction: column; gap: 8px; }

.market__update-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 14px;
  color: var(--ditto-color-text-secondary, #666);
}

.market__update-arrow { color: var(--ditto-color-text-disabled, #999); margin: 0 4px; }
.market__update-new { color: var(--ditto-color-primary-500, #0078d4); font-weight: 600; }

.market__page-title { font-size: 20px; font-weight: 700; margin: 0 0 20px; }

.market__publish-guide { max-width: 600px; }

.market__publish-step {
  margin-bottom: 16px;
  padding: 16px;
  background: var(--ditto-color-surface-raised, #fff);
  border: 1px solid var(--ditto-color-border-subtle, #e5e5e5);
  border-radius: 10px;
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.market__publish-step-num {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--ditto-color-primary-500, #0078d4);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}

.market__publish-step-content { flex: 1; }
.market__publish-step-content h3 { margin: 0 0 8px; font-size: 15px; }
.market__publish-step-content p { margin: 0; font-size: 13px; line-height: 1.6; color: var(--ditto-color-text-secondary, #444); }
.market__publish-step-content code { background: var(--ditto-color-surface-overlay, #f0f0f0); padding: 2px 6px; border-radius: 4px; font-size: 12px; }
.market__publish-step-content a { color: var(--ditto-color-primary-500, #0078d4); }

.market__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  gap: 12px;
  color: var(--ditto-color-text-secondary, #666);
}

.market__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--ditto-color-border-subtle, #e5e5e5);
  border-top-color: var(--ditto-color-primary-500, #0078d4);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.market__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  gap: 12px;
  color: var(--ditto-color-semantic-error, #e53935);
}

.market__empty {
  text-align: center;
  padding: 40px;
  color: var(--ditto-color-text-disabled, #999);
  font-size: 15px;
}

.market__toast {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  margin: 8px 0;
  background: #fff3e0;
  border: 1px solid #ffe0b2;
  border-radius: 8px;
  font-size: 13px;
  color: #e65100;
}

.market__category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}

.market__category-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 8px;
  border: 1px solid var(--ditto-color-border-subtle, #e5e5e5);
  border-radius: 10px;
  background: var(--ditto-color-surface-raised, #fff);
  cursor: pointer;
  transition: all 0.15s;
}

.market__category-card:hover {
  border-color: var(--ditto-color-primary-200, #90caf9);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transform: translateY(-1px);
}

.market__category-icon { font-size: 28px; }
.market__category-name { font-size: 13px; font-weight: 500; color: var(--ditto-color-text-secondary, #444); }

.market__cta {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  background: linear-gradient(135deg, var(--ditto-color-primary-50, #e3f2fd), var(--ditto-color-primary-100, #bbdefb));
  border-radius: 12px;
}

.market__cta-icon { font-size: 32px; }
.market__cta-text { flex: 1; }
.market__cta-text h3 { margin: 0 0 4px; font-size: 16px; }
.market__cta-text p { margin: 0; font-size: 13px; color: var(--ditto-color-text-secondary, #666); }

</style>
