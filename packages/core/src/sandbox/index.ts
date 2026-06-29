import type { SandboxMode } from '@ditto/shared';
import { DittoError } from '@ditto/shared';
import { IFrameSandbox } from './iframe-sandbox';
import { ShadowSandbox } from './shadow-sandbox';
import { WorkerSandbox } from './worker-sandbox';

export interface SandboxOptions {
  origin?: string;
  sandboxAttributes?: string;
  allowSameOrigin?: boolean;
  /** Worker 沙盒专用选项：代码源或 URL。 */
  workerCode?: string;
  workerUrl?: string;
  workerModule?: boolean;
}

export type CellSandbox = IFrameSandbox | ShadowSandbox | WorkerSandbox;

/**
 * 沙盒工厂。
 * - iframe-strict：第三方应用（需 origin）
 * - shadow-trusted：native 应用（无隔离，shell 信任）
 * - worker：Worker 隔离，无 DOM 访问，纯逻辑/后台任务（需 workerCode 或 workerUrl）
 */
export function createSandbox(appId: string, mode: SandboxMode, opts: SandboxOptions): CellSandbox {
  switch (mode) {
    case 'iframe-strict':
      if (!opts.origin) {
        throw DittoError.fromUnknown(
          new Error(`createSandbox: iframe-strict requires opts.origin for app "${appId}"`),
          'SANDBOX_CREATE_FAILED'
        );
      }
      return new IFrameSandbox(appId, {
        origin: opts.origin,
        sandboxAttributes: opts.sandboxAttributes,
        allowSameOrigin: opts.allowSameOrigin,
      });
    case 'shadow-trusted':
      return new ShadowSandbox(appId);
    case 'worker':
      if (!opts.workerCode && !opts.workerUrl) {
        throw DittoError.fromUnknown(
          new Error(`createSandbox: worker requires opts.workerCode or opts.workerUrl for app "${appId}"`),
          'SANDBOX_CREATE_FAILED'
        );
      }
      return new WorkerSandbox(appId, {
        code: opts.workerCode,
        url: opts.workerUrl,
        module: opts.workerModule,
      });
    default:
      throw DittoError.fromUnknown(
        new Error(`createSandbox: unknown mode "${mode as string}"`),
        'SANDBOX_CREATE_FAILED'
      );
  }
}

export { IFrameSandbox } from './iframe-sandbox';
export type { IFrameSandboxOptions } from './iframe-sandbox';
export { ShadowSandbox } from './shadow-sandbox';
export { WorkerSandbox } from './worker-sandbox';
export type { WorkerSandboxOptions } from './worker-sandbox';
