import type { DMRequest } from "./types.js";

/**
 * Async queue: WS pushes dm_requests, wait_for_message pops them.
 * No polling, no timers — pure async await.
 */
export class MessageQueue {
  private queue: DMRequest[] = [];
  private waiters: Array<(msg: DMRequest) => void> = [];

  /** Called by WS client when server:dm_request arrives. */
  push(msg: DMRequest): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(msg);
    } else {
      this.queue.push(msg);
    }
  }

  /** Promise that resolves on next message. Used by wait_for_message tool. */
  waitForNext(): Promise<DMRequest> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);

    return new Promise<DMRequest>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /** Number of queued messages waiting to be consumed. */
  get pending(): number {
    return this.queue.length;
  }
}
