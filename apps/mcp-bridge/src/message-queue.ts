import type { DMRequest } from "./types.js";
import { log } from "./logger.js";

interface PendingWaiter {
  resolve: (msg: DMRequest) => void;
  reject: (err: Error) => void;
}

/**
 * Async queue: WS pushes dm_requests, wait_for_message pops them.
 * No polling, no timers — pure async await.
 */
export class MessageQueue {
  private queue: DMRequest[] = [];
  private waiters: PendingWaiter[] = [];

  /** Called by WS client when server:dm_request arrives. */
  push(msg: DMRequest): void {
    log(
      "msg-queue",
      `push: requestId=${msg.requestId}, waiters=${this.waiters.length}, queued=${this.queue.length}`,
    );
    const waiter = this.waiters.shift();
    if (waiter) {
      log("msg-queue", "push: resolved waiting consumer");
      waiter.resolve(msg);
    } else {
      log("msg-queue", "push: buffered (no waiter)");
      this.queue.push(msg);
    }
  }

  /** Promise that resolves on next message. Used by wait_for_message tool.
   *  Accepts an optional AbortSignal so the MCP SDK can cancel stale waiters
   *  (e.g. after context compression) without deadlocking the queue. */
  waitForNext(signal?: AbortSignal): Promise<DMRequest> {
    log(
      "msg-queue",
      `waitForNext: queued=${this.queue.length}, aborted=${signal?.aborted ?? "no signal"}`,
    );
    const queued = this.queue.shift();
    if (queued) {
      log("msg-queue", "waitForNext: returning buffered message immediately");
      return Promise.resolve(queued);
    }

    return new Promise<DMRequest>((resolve, reject) => {
      const waiter: PendingWaiter = { resolve: wrappedResolve, reject: wrappedReject };

      function wrappedResolve(msg: DMRequest) {
        signal?.removeEventListener("abort", onAbort);
        resolve(msg);
      }

      function wrappedReject(err: Error) {
        signal?.removeEventListener("abort", onAbort);
        reject(err);
      }

      const onAbort = () => {
        const idx = this.waiters.indexOf(waiter);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(new Error("wait_for_message cancelled"));
      };

      if (signal?.aborted) {
        reject(new Error("wait_for_message cancelled"));
        return;
      }

      signal?.addEventListener("abort", onAbort, { once: true });
      this.waiters.push(waiter);
    });
  }

  /** Reject all pending waiters (e.g. on disconnect) so wait_for_message doesn't hang forever. */
  rejectAllWaiters(): void {
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) {
      waiter.reject(new Error("DM disconnected — reconnecting"));
    }
  }

  /** Number of queued messages waiting to be consumed. */
  get pending(): number {
    return this.queue.length;
  }
}
