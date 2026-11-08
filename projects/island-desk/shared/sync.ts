import { advanceTimer, timerAction, type Store } from "./model.js";
import type { Action } from "./actions.js";

export type QueuedAction = Action & { requestId?: string };
export class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Only permanent validation failures leave the retry queue; retain them for recovery. */
export async function drainQueue(
  queue: QueuedAction[],
  send: (action: QueuedAction) => Promise<unknown>,
  persist: () => void,
  reject: (action: QueuedAction, error: RequestError) => void,
) {
  while (queue.length) {
    const action = queue[0];
    try { await send(action); }
    catch (error) {
      if (!(error instanceof RequestError) || error.status !== 400) throw error;
      reject(action, error);
    }
    queue.shift();
    persist();
  }
}

/** Receipts live in the same atomic workspace save as the timer change. */
export function applyPhoneTimer(store: Store, action: "toggle" | "reset" | "skip" | "work" | "break", requestId?: string, now = Date.now()) {
  if (requestId && store.timerReceipts?.includes(requestId)) return false;
  advanceTimer(store, now);
  timerAction(store, action, now);
  if (requestId) store.timerReceipts = [...(store.timerReceipts || []), requestId].slice(-10000);
  return true;
}
