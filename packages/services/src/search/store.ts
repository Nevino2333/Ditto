import { defineStore } from 'pinia';
import type { AppManifest } from '@ditto/shared';

export interface SearchProvider {
  id: string;
  label: string;
  icon?: string;
  search(query: string): SearchItem[];
}

export interface SearchItem {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  category: string;
  action: () => void;
}

export interface SearchCommand {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  keywords: string[];
  action: () => void;
}

export const useSearchStore = defineStore('ditto-search', {
  state: () => ({
    providers: [] as SearchProvider[],
    commands: [] as SearchCommand[],
    recentSearches: [] as string[],
    maxRecentSearches: 10,
  }),

  getters: {
    allCommands: (state): SearchCommand[] => state.commands,
  },

  actions: {
    registerProvider(provider: SearchProvider) {
      const idx = this.providers.findIndex((p) => p.id === provider.id);
      if (idx !== -1) {
        this.providers[idx] = provider;
      } else {
        this.providers.push(provider);
      }
    },

    unregisterProvider(providerId: string) {
      this.providers = this.providers.filter((p) => p.id !== providerId);
    },

    registerCommand(command: SearchCommand) {
      const idx = this.commands.findIndex((c) => c.id === command.id);
      if (idx !== -1) {
        this.commands[idx] = command;
      } else {
        this.commands.push(command);
      }
    },

    unregisterCommand(commandId: string) {
      this.commands = this.commands.filter((c) => c.id !== commandId);
    },

    search(query: string, apps?: AppManifest[]): SearchItem[] {
      const q = query.toLowerCase().trim();
      if (!q) return [];

      const results: SearchItem[] = [];

      if (apps) {
        for (const app of apps) {
          if (
            app.name.toLowerCase().includes(q) ||
            app.id.toLowerCase().includes(q) ||
            (app.description && app.description.toLowerCase().includes(q)) ||
            (app.category && app.category.toLowerCase().includes(q))
          ) {
            results.push({
              id: `app:${app.id}`,
              title: app.name,
              description: app.description || app.category,
              icon: app.icon,
              category: '应用',
              action: () => {},
            });
          }
        }
      }

      for (const cmd of this.commands) {
        if (
          cmd.title.toLowerCase().includes(q) ||
          (cmd.description && cmd.description.toLowerCase().includes(q)) ||
          cmd.keywords.some((kw) => kw.toLowerCase().includes(q))
        ) {
          results.push({
            id: `cmd:${cmd.id}`,
            title: cmd.title,
            description: cmd.description,
            icon: cmd.icon,
            category: '命令',
            action: cmd.action,
          });
        }
      }

      for (const provider of this.providers) {
        try {
          const providerResults = provider.search(query);
          results.push(...providerResults);
        } catch { /* ignore provider errors */ }
      }

      return results;
    },

    addRecentSearch(query: string) {
      const q = query.trim();
      if (!q) return;
      this.recentSearches = [q, ...this.recentSearches.filter((s) => s !== q)]
        .slice(0, this.maxRecentSearches);
    },

    clearRecentSearches() {
      this.recentSearches = [];
    },
  },
});
