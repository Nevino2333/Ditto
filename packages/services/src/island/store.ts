import { defineStore } from 'pinia';
import type { IslandSlot } from '@ditto/shared';
import { generateId } from '@ditto/shared';

export const useIslandStore = defineStore('ditto-island', {
  state: () => ({
    slots: [] as IslandSlot[],
    activeSlotId: null as string | null,
    expanded: false,
  }),

  getters: {
    activeSlot: (state): IslandSlot | undefined =>
      state.slots.find((s) => s.id === state.activeSlotId),
    highestPriority: (state): IslandSlot | undefined => {
      if (state.slots.length === 0) return undefined;
      const priorityOrder: Record<string, number> = { urgent: 4, high: 3, normal: 2, low: 1 };
      return [...state.slots].sort((a, b) =>
        (priorityOrder[b.priority] ?? 0) - (priorityOrder[a.priority] ?? 0)
      )[0];
    },
    slotsByApp: (state) => (appId: string): IslandSlot[] =>
      state.slots.filter((s) => s.appId === appId),
  },

  actions: {
    addSlot(slot: Omit<IslandSlot, 'id'>): string {
      const id = generateId();
      this.slots.push({ ...slot, id });
      return id;
    },

    removeSlot(slotId: string): void {
      this.slots = this.slots.filter((s) => s.id !== slotId);
      if (this.activeSlotId === slotId) {
        this.activeSlotId = this.highestPriority?.id ?? null;
      }
    },

    updateSlot(slotId: string, partial: Partial<IslandSlot>): void {
      const slot = this.slots.find((s) => s.id === slotId);
      if (slot) {
        Object.assign(slot, partial);
      }
    },

    expandSlot(slotId: string): void {
      const slot = this.slots.find((s) => s.id === slotId);
      if (slot?.expandable) {
        this.activeSlotId = slotId;
        this.expanded = true;
        slot.expanded = true;
      }
    },

    collapseSlot(): void {
      this.expanded = false;
      for (const slot of this.slots) {
        slot.expanded = false;
      }
    },

    removeAppSlots(appId: string): void {
      this.slots = this.slots.filter((s) => s.appId !== appId);
    },
  },
});
