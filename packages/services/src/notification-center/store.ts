import { defineStore } from 'pinia';

export interface NotificationEntry {
  id: string;
  title: string;
  body: string;
  icon?: string;
  type: 'info' | 'success' | 'warning' | 'error';
  source: string;
  timestamp: number;
  read: boolean;
  persistent: boolean;
  actions?: { label: string; handler: string }[];
}

export const useNotificationStore = defineStore('ditto-notifications', {
  state: () => ({
    notifications: [] as NotificationEntry[],
    maxNotifications: 100,
  }),

  getters: {
    unreadCount: (state): number => state.notifications.filter((n) => !n.read).length,
    unread: (state): NotificationEntry[] => state.notifications.filter((n) => !n.read),
    recent: (state): NotificationEntry[] =>
      [...state.notifications].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20),
    bySource: (state) => (source: string): NotificationEntry[] =>
      state.notifications.filter((n) => n.source === source),
  },

  actions: {
    pushNotification(notification: Omit<NotificationEntry, 'id' | 'timestamp' | 'read'>): string {
      const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const entry: NotificationEntry = {
        ...notification,
        id,
        timestamp: Date.now(),
        read: false,
      };

      this.notifications.unshift(entry);

      if (this.notifications.length > this.maxNotifications) {
        this.notifications = this.notifications.slice(0, this.maxNotifications);
      }

      return id;
    },

    markAsRead(notificationId: string) {
      const notif = this.notifications.find((n) => n.id === notificationId);
      if (notif) notif.read = true;
    },

    markAllAsRead() {
      for (const notif of this.notifications) {
        notif.read = true;
      }
    },

    dismissNotification(notificationId: string) {
      const idx = this.notifications.findIndex((n) => n.id === notificationId);
      if (idx !== -1) {
        this.notifications.splice(idx, 1);
      }
    },

    clearAll() {
      this.notifications = [];
    },

    clearBySource(source: string) {
      this.notifications = this.notifications.filter((n) => n.source !== source);
    },
  },
});
