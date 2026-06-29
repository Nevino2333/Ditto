import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  AppStoreEntry,
  MarketCategory,
  MarketFeatured,
  MarketReview,
  InstalledAppInfo,
  UpdateInfo,
  AppManifest,
} from '@ditto/shared';
import { useAppStore } from '@ditto/services';

type MarketView = 'home' | 'apps' | 'detail' | 'installed' | 'updates' | 'publish';

export const useMarketStore = defineStore('market', () => {
  const categories = ref<MarketCategory[]>([]);
  const featured = ref<MarketFeatured | null>(null);
  const apps = ref<Map<string, AppStoreEntry>>(new Map());
  const appList = ref<AppStoreEntry[]>([]);
  const currentReviews = ref<MarketReview[]>([]);
  const installedApps = ref<InstalledAppInfo[]>([]);
  const updatesAvailable = ref<UpdateInfo[]>([]);

  const currentView = ref<MarketView>('home');
  const selectedAppId = ref<string | null>(null);
  const searchQuery = ref('');
  const selectedCategory = ref<string | null>(null);
  const sortBy = ref<'newest' | 'rating' | 'downloads'>('newest');
  const loading = ref(false);
  const error = ref<string | null>(null);
  const installingAppId = ref<string | null>(null);

  const selectedApp = computed(() => {
    if (!selectedAppId.value) return null;
    return apps.value.get(selectedAppId.value) ?? null;
  });

  const filteredApps = computed(() => {
    let result = [...appList.value];
    if (selectedCategory.value) {
      result = result.filter(a => a.market.category === selectedCategory.value);
    }
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase();
      result = result.filter(a =>
        a.manifest.name.toLowerCase().includes(q) ||
        a.market.summary.toLowerCase().includes(q) ||
        a.market.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return result;
  });

  const serverUrl = typeof window !== 'undefined' ? window.location.origin : '';

  async function fetchCategories() {
    try {
      const res = await fetch(`${serverUrl}/api/market/categories`);
      if (res.ok) categories.value = await res.json();
      else console.warn('[Market] fetchCategories failed:', res.status, res.statusText);
    } catch (e) {
      console.warn('[Market] fetchCategories error:', e);
    }
  }

  async function fetchFeatured() {
    try {
      const res = await fetch(`${serverUrl}/api/market/featured`);
      if (res.ok) {
        const data = await res.json();
        featured.value = data;

        const allAppIds = new Set<string>();
        if (data.banner) data.banner.forEach((b: { appId: string }) => allAppIds.add(b.appId));
        if (data.editorsChoice) data.editorsChoice.forEach((id: string) => allAppIds.add(id));
        if (data.newApps) data.newApps.forEach((id: string) => allAppIds.add(id));
        if (data.topRated) data.topRated.forEach((id: string) => allAppIds.add(id));

        const missingIds = [...allAppIds].filter(id => !apps.value.has(id));
        if (missingIds.length > 0) {
          const promises = missingIds.map(id =>
            fetch(`${serverUrl}/api/market/apps/${id}`)
              .then(r => r.ok ? r.json() : null)
              .then(data => {
                if (data) {
                  const { reviews, ...entry } = data;
                  apps.value.set(id, entry as AppStoreEntry);
                }
              })
              .catch(() => {})
          );
          await Promise.all(promises);
        }
      }
    } catch (e) {
      console.warn('[Market] fetchFeatured error:', e);
    }
  }

  async function fetchApps() {
    loading.value = true;
    error.value = null;
    try {
      const params = new URLSearchParams();
      if (selectedCategory.value) params.set('category', selectedCategory.value);
      if (searchQuery.value) params.set('search', searchQuery.value);
      params.set('sort', sortBy.value);
      const res = await fetch(`${serverUrl}/api/market/apps?${params}`);
      if (res.ok) {
        const data = await res.json();
        appList.value = data.apps ?? [];
        for (const app of data.apps ?? []) {
          apps.value.set(app.id, app);
        }
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch apps';
    } finally {
      loading.value = false;
    }
  }

  async function fetchAppDetail(appId: string) {
    loading.value = true;
    try {
      const res = await fetch(`${serverUrl}/api/market/apps/${appId}`);
      if (res.ok) {
        const data = await res.json();
        const { reviews, ...entry } = data;
        apps.value.set(appId, entry as AppStoreEntry);
        currentReviews.value = reviews ?? [];
        selectedAppId.value = appId;
        currentView.value = 'detail';
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch app detail';
    } finally {
      loading.value = false;
    }
  }

  async function installApp(appId: string) {
    installingAppId.value = appId;
    try {
      const userId = localStorage.getItem('ditto_user_id') ?? 'current';
      const res = await fetch(`${serverUrl}/api/market/apps/${appId}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Installation failed');
      await fetchInstalled();
      const appStore = useAppStore();
      const entry = apps.value.get(appId);
      const manifest: AppManifest = {
        id: appId,
        name: data.name ?? entry?.manifest.name ?? appId,
        version: data.version ?? entry?.manifest.version ?? '0.1.0',
        description: entry?.manifest.description ?? '',
        icon: entry?.manifest.icon ?? 'fa-solid fa-box',
        entry: 'frontend/index.html',
        category: entry?.manifest.category ?? 'installed',
        sandbox: 'trusted',
        permissions: entry?.manifest.permissions ?? [],
        type: entry?.manifest.type ?? (data.type as AppManifest['type']) ?? 'app',
        window: entry?.manifest.window ?? { width: 800, height: 600, minWidth: 400, minHeight: 300, resizable: true, maximizable: true },
      };
      appStore.registerApp(manifest, false);
      return data;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Installation failed';
      throw e;
    } finally {
      installingAppId.value = null;
    }
  }

  async function fetchInstalled() {
    try {
      const res = await fetch(`${serverUrl}/api/market/installed`);
      if (res.ok) {
        const data = await res.json();
        installedApps.value = data.apps ?? [];
      }
    } catch (e) {
      console.warn('[Market] fetchInstalled error:', e);
    }
  }

  async function fetchUpdates() {
    try {
      const res = await fetch(`${serverUrl}/api/market/updates`);
      if (res.ok) {
        const data = await res.json();
        updatesAvailable.value = data.updates ?? [];
      }
    } catch (e) {
      console.warn('[Market] fetchUpdates error:', e);
    }
  }

  function navigate(view: MarketView, appId?: string) {
    currentView.value = view;
    if (appId) selectedAppId.value = appId;
    else if (view !== 'detail') selectedAppId.value = null;
  }

  function setCategory(cat: string | null) {
    selectedCategory.value = cat;
    fetchApps();
  }

  function setSearch(query: string) {
    searchQuery.value = query;
  }

  function setSort(sort: 'newest' | 'rating' | 'downloads') {
    sortBy.value = sort;
    fetchApps();
  }

  function isInstalled(appId: string): boolean {
    return installedApps.value.some(a => a.appId === appId);
  }

  return {
    categories, featured, apps, appList, currentReviews,
    installedApps, updatesAvailable, currentView, selectedAppId,
    searchQuery, selectedCategory, sortBy, loading, error,
    installingAppId, selectedApp, filteredApps,
    fetchCategories, fetchFeatured, fetchApps, fetchAppDetail,
    installApp, fetchInstalled, fetchUpdates, navigate,
    setCategory, setSearch, setSort, isInstalled,
  };
});
