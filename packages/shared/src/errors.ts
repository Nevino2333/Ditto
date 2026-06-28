export type DittoErrorCode =
  | 'KERNEL_NOT_INITIALIZED'
  | 'KERNEL_ALREADY_INITIALIZED'
  | 'KERNEL_STAGE_FAILED'
  | 'IPC_REQUEST_TIMEOUT'
  | 'IPC_HANDLER_ERROR'
  | 'IPC_NO_HANDLER'
  | 'IPC_NO_ROUTE'
  | 'IPC_BRIDGE_DISCONNECTED'
  | 'PLUGIN_NOT_FOUND'
  | 'PLUGIN_ALREADY_LOADED'
  | 'PLUGIN_LOAD_FAILED'
  | 'PLUGIN_PERMISSION_DENIED'
  | 'CELL_NOT_FOUND'
  | 'CELL_ALREADY_RUNNING'
  | 'CELL_START_FAILED'
  | 'CELL_PERMISSION_DENIED'
  | 'PERMISSION_DENIED'
  | 'PERMISSION_REQUIRED'
  | 'SANDBOX_CREATE_FAILED'
  | 'SANDBOX_MESSAGE_INVALID'
  | 'SANDBOX_MODE_UNSUPPORTED'
  | 'SERVICE_NOT_REGISTERED'
  | 'SERVICE_ALREADY_REGISTERED'
  | 'VFS_FILE_NOT_FOUND'
  | 'VFS_PATH_INVALID'
  | 'VFS_PROVIDER_NOT_FOUND'
  | 'VFS_WRITE_FAILED'
  | 'VFS_READ_FAILED'
  | 'VFS_DELETE_FAILED'
  | 'APP_MANIFEST_INVALID'
  | 'APP_NOT_FOUND'
  | 'APP_ALREADY_RUNNING'
  | 'STORAGE_UNAVAILABLE'
  | 'STORAGE_QUOTA_EXCEEDED'
  | 'NETWORK_ERROR'
  | 'NETWORK_PROXY_FAILED'
  | 'UNKNOWN';

export class DittoError extends Error {
  readonly code: DittoErrorCode;
  readonly details?: unknown;
  readonly recoverable: boolean;

  constructor(code: DittoErrorCode, message: string, options?: { details?: unknown; recoverable?: boolean; cause?: Error }) {
    super(message);
    this.name = 'DittoError';
    this.code = code;
    this.details = options?.details;
    this.recoverable = options?.recoverable ?? false;
    if (options?.cause) {
      (this as any).cause = options.cause;
    }
    Object.setPrototypeOf(this, DittoError.prototype);
  }

  static fromUnknown(error: unknown, fallbackCode: DittoErrorCode = 'UNKNOWN'): DittoError {
    if (error instanceof DittoError) return error;
    const message = error instanceof Error ? error.message : String(error);
    return new DittoError(fallbackCode, message, { cause: error instanceof Error ? error : undefined });
  }

  static ipcTimeout(channel: string, timeout: number): DittoError {
    return new DittoError('IPC_REQUEST_TIMEOUT', `IPC request to "${channel}" timed out after ${timeout}ms`, { recoverable: true });
  }

  static pluginNotFound(id: string): DittoError {
    return new DittoError('PLUGIN_NOT_FOUND', `Plugin "${id}" not found`);
  }

  static pluginPermissionDenied(id: string, permission: string): DittoError {
    return new DittoError('PLUGIN_PERMISSION_DENIED', `Plugin "${id}" denied permission "${permission}"`, { recoverable: true });
  }

  static vfsFileNotFound(path: string): DittoError {
    return new DittoError('VFS_FILE_NOT_FOUND', `File not found: ${path}`, { recoverable: true });
  }

  static vfsPathInvalid(path: string): DittoError {
    return new DittoError('VFS_PATH_INVALID', `Invalid path: ${path}`);
  }

  static appManifestInvalid(errors: string[]): DittoError {
    return new DittoError('APP_MANIFEST_INVALID', `Invalid app manifest: ${errors.join('; ')}`, { details: errors });
  }

  static storageUnavailable(): DittoError {
    return new DittoError('STORAGE_UNAVAILABLE', 'Storage is not available in this environment', { recoverable: true });
  }

  static cellNotFound(id: string): DittoError {
    return new DittoError('CELL_NOT_FOUND', `Cell "${id}" not found`);
  }

  static cellAlreadyRunning(id: string): DittoError {
    return new DittoError('CELL_ALREADY_RUNNING', `Cell "${id}" is already running`);
  }

  static cellStartFailed(id: string, cause?: unknown): DittoError {
    return new DittoError('CELL_START_FAILED', `Failed to start cell "${id}"`, { cause: cause instanceof Error ? cause : undefined });
  }

  static sandboxModeUnsupported(mode: string): DittoError {
    return new DittoError('SANDBOX_MODE_UNSUPPORTED', `Sandbox mode "${mode}" is not supported in this build`);
  }

  static serviceNotRegistered(id: string): DittoError {
    return new DittoError('SERVICE_NOT_REGISTERED', `Service "${id}" is not registered`);
  }

  static serviceAlreadyRegistered(id: string): DittoError {
    return new DittoError('SERVICE_ALREADY_REGISTERED', `Service "${id}" is already registered`);
  }

  static ipcNoRoute(target: string): DittoError {
    return new DittoError('IPC_NO_ROUTE', `No route for target "${target}"`, { recoverable: true });
  }
}

export function isDittoError(error: unknown): error is DittoError {
  return error instanceof DittoError;
}

export function isRecoverable(error: unknown): boolean {
  if (error instanceof DittoError) return error.recoverable;
  return false;
}

export type ErrorHandler = (error: DittoError) => void;

class GlobalErrorHandler {
  private handlers = new Set<ErrorHandler>();

  addHandler(handler: ErrorHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  handle(error: unknown): void {
    const dittoError = isDittoError(error) ? error : DittoError.fromUnknown(error);
    for (const handler of this.handlers) {
      try {
        handler(dittoError);
      } catch (e) {
        console.error('[Ditto] Error in error handler:', e);
      }
    }
  }
}

export const globalErrorHandler = new GlobalErrorHandler();
