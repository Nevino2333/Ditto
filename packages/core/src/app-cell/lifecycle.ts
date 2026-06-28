import type { ClientCellStatus } from '@ditto/shared';
import { DittoError } from '@ditto/shared';

/**
 * Cell 生命周期状态机。
 * 合法转换：loading→active, loading→error, active→paused, paused→active,
 *           active→stopped, paused→stopped, error→stopped
 */
const TRANSITIONS: Record<ClientCellStatus, ClientCellStatus[]> = {
  loading: ['active', 'error', 'stopped'],
  active: ['paused', 'stopped', 'error'],
  paused: ['active', 'stopped'],
  stopped: [],
  error: ['stopped', 'loading'],
};

export function canTransition(from: ClientCellStatus, to: ClientCellStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: ClientCellStatus, to: ClientCellStatus): void {
  if (!canTransition(from, to)) {
    throw DittoError.fromUnknown(
      new Error(`Invalid cell state transition: ${from} → ${to}`),
      'CELL_START_FAILED'
    );
  }
}
