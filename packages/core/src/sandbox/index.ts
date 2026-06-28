import type { SandboxMode } from '@ditto/shared';
import { DittoError } from '@ditto/shared';
import { IFrameSandbox } from './iframe-sandbox';
import { ShadowSandbox } from './shadow-sandbox';

export interface SandboxOptions {
  origin?: string;
  sandboxAttributes?: string;
  allowSameOrigin?: boolean;
}

export type CellSandbox = IFrameSandbox | ShadowSandbox;

/**
 * 沙盒工厂。
 * - iframe-strict：第三方应用（需 origin）
 * - shadow-trusted：native 应用（无隔离，shell 信任）
 * - worker：阶段 2 实现，阶段 1 抛错
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
      throw DittoError.sandboxModeUnsupported('worker');
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
