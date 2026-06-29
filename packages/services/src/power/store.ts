import { defineStore } from 'pinia';

export type PowerAction = 'sleep' | 'shutdown' | 'restart' | 'logout' | 'lock';

export interface PowerEvent {
  action: PowerAction;
  timestamp: number;
}

/**
 * 电源 / 会话管理服务。
 *
 * 设计：store 只负责状态变更与事件广播，具体副作用（关闭窗口、显示锁屏、
 * 重新加载 shell）由 Shell 监听 `lastEvent` 后执行。这样 PowerService
 * 可以独立于 UI 框架测试，Shell 也可以注入自定义行为（如 Kiosk 场景
 * 的"关机即退出全屏"）。
 *
 * 事件流：
 *   store.requestShutdown() → lastAction = 'shutdown'
 *   Shell watch(lastAction) → 关闭所有窗口 + 显示关机画面
 */
export const usePowerStore = defineStore('ditto-power', {
  state: () => ({
    locked: false,
    lastAction: null as PowerAction | null,
    lastActionTime: 0,
    /** 是否正在执行电源动作（防止重复触发） */
    transitioning: false,
  }),

  getters: {
    /** 当前电源事件（供 Shell watch） */
    lastEvent: (state): PowerEvent | null => {
      if (!state.lastAction) return null;
      return { action: state.lastAction, timestamp: state.lastActionTime };
    },
  },

  actions: {
    /** 睡眠：释放屏幕唤醒锁，进入低功耗（PWA 场景为视觉提示） */
    async sleep() {
      if (this.transitioning) return;
      this.transitioning = true;
      this.lastAction = 'sleep';
      this.lastActionTime = Date.now();
      try {
        // PWA Wake Lock API（Chrome 84+，旧版本忽略）
        const nav = navigator as any;
        if (nav.wakeLock) {
          const lock = await nav.wakeLock.request('screen');
          if (lock) lock.release();
        }
      } catch { /* 不支持时静默 */ }
      this.transitioning = false;
    },

    /** 关机：关闭所有窗口，显示关机画面 */
    shutdown() {
      if (this.transitioning) return;
      this.transitioning = true;
      this.lastAction = 'shutdown';
      this.lastActionTime = Date.now();
    },

    /** 重启：关闭所有窗口后重新加载 shell */
    restart() {
      if (this.transitioning) return;
      this.transitioning = true;
      this.lastAction = 'restart';
      this.lastActionTime = Date.now();
    },

    /** 注销：清理会话，显示登录界面 */
    logout() {
      if (this.transitioning) return;
      this.transitioning = true;
      this.lastAction = 'logout';
      this.lastActionTime = Date.now();
      this.locked = true;
    },

    /** 锁屏：保持会话，显示锁屏界面 */
    lock() {
      if (this.locked) return;
      this.lastAction = 'lock';
      this.lastActionTime = Date.now();
      this.locked = true;
    },

    /** 解锁（用户输入密码/生物识别后） */
    unlock() {
      this.locked = false;
      this.transitioning = false;
    },

    /** 重置状态（Shell 完成电源动作后调用） */
    resetTransition() {
      this.transitioning = false;
    },
  },
});
