import type { IPCMessage } from '@ditto/shared';
import { DittoError } from '@ditto/shared';

type SandboxMessageHandler = (message: IPCMessage) => void;

/**
 * Worker 沙盒（阶段 2 实现）。
 * 阶段 1 仅 stub，所有方法抛 NotSupported。
 */
export class WorkerSandbox {
  constructor(appId: string) {
    throw DittoError.sandboxModeUnsupported('worker');
  }

  mount(): void { /* stub */ }
  send(): void { /* stub */ }
  onMessage(): () => void { return () => {}; }
  destroy(): void { /* stub */ }
}
