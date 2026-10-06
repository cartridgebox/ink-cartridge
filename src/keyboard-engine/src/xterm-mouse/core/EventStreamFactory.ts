import type { EventEmitter } from 'node:events';
import type { MouseEvent, MouseEventAction } from '../types/index.js';
import { MouseError } from '../types/index.js';

/**
 * EventStreamFactory creates async generators for mouse event streams.
 *
 * Responsibilities:
 * - Create type-specific event streams (eventsOf)
 * - Create debounced move event streams
 * - Create all-event streams
 * - Handle queue management, abort signals, and cleanup
 */
export class EventStreamFactory {
  /**
   * Creates an event stream factory over the given emitter.
   * @param emitter The event emitter to listen for mouse events on.
   */
  constructor(private emitter: EventEmitter) {}

  /**
   * Returns an async generator that yields mouse events of a specific type.
   *
   * @param type The type of mouse event to listen for
   * @param options Configuration for the event stream
   * @yields Mouse events of the specified type
   */
  public async *eventsOf(
    type: MouseEventAction,
    {
      latestOnly = false,
      maxQueue = 100,
      signal,
    }: { latestOnly?: boolean; maxQueue?: number; signal?: AbortSignal } = {},
  ): AsyncGenerator<MouseEvent> {
    if (signal?.aborted) {
      throw new Error('The operation was aborted.');
    }

    const queue: MouseEvent[] = [];
    const errorQueue: Error[] = [];
    const finalMaxQueue = Math.min(maxQueue, 1000);
    let latest: MouseEvent | null = null;
    let resolveNext: ((value: MouseEvent) => void) | null = null;
    let rejectNext: ((err: Error) => void) | null = null;

    const handler = (ev: MouseEvent): void => {
      if (resolveNext) {
        resolveNext(ev);
        resolveNext = null;
        rejectNext = null;
        latest = null;
      } else if (latestOnly) {
        latest = ev;
      } else {
        if (queue.length >= finalMaxQueue) queue.shift();
        queue.push(ev);
      }
    };

    const errorHandler = (err: Error): void => {
      const mouseError = new MouseError(`Error in mouse event stream: ${err.message}`, err);
      if (rejectNext) {
        rejectNext(mouseError);
        resolveNext = null;
        rejectNext = null;
      } else {
        errorQueue.push(mouseError);
      }
    };

    const abortHandler = (): void => {
      const err = new MouseError('The operation was aborted.');
      if (rejectNext) {
        rejectNext(err);
        resolveNext = null;
        rejectNext = null;
      } else {
        errorQueue.push(err);
      }
    };

    this.emitter.on(type, handler);
    this.emitter.on('error', errorHandler);
    signal?.addEventListener('abort', abortHandler);

    try {
      while (true) {
        if (signal?.aborted) {
          throw new MouseError('The operation was aborted.');
        }

        if (errorQueue.length > 0) {
          throw errorQueue.shift();
        }

        if (queue.length > 0) {
          const event = queue.shift();
          if (event) {
            yield event;
          }
        } else if (latest !== null) {
          const ev = latest;
          latest = null;
          yield ev;
        } else {
          // This is an async generator, await in loop is necessary
          yield await new Promise<MouseEvent>((resolve, reject) => {
            resolveNext = resolve;
            rejectNext = reject;
          });
        }
      }
    } finally {
      this.emitter.off(type, handler);
      this.emitter.off('error', errorHandler);
      signal?.removeEventListener('abort', abortHandler);
    }
  }

  /**
   * Returns an async generator that yields move events at most once per specified interval.
   *
   * @param options Configuration for the debounced event stream
   * @yields Debounced mouse move events
   */
  public async *debouncedMoveEvents({
    interval = 16,
    signal,
  }: {
    interval?: number;
    signal?: AbortSignal;
  } = {}): AsyncGenerator<MouseEvent> {
    if (signal?.aborted) {
      throw new MouseError('The operation was aborted.');
    }

    let latestEvent: MouseEvent | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let resolveNext: ((value: MouseEvent) => void) | null = null;
    let rejectNext: ((err: Error) => void) | null = null;
    const errorQueue: Error[] = [];

    const scheduleEvent = (ev: MouseEvent): void => {
      latestEvent = ev;

      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        if (latestEvent !== null && resolveNext !== null) {
          const eventToYield = latestEvent;
          latestEvent = null;
          resolveNext(eventToYield);
          resolveNext = null;
          rejectNext = null;
        }
      }, interval);
    };

    const errorHandler = (err: Error): void => {
      const mouseError = new MouseError(`Error in mouse event stream: ${err.message}`, err);
      if (rejectNext) {
        rejectNext(mouseError);
        resolveNext = null;
        rejectNext = null;
      } else {
        errorQueue.push(mouseError);
      }
    };

    const abortHandler = (): void => {
      const err = new MouseError('The operation was aborted.');
      if (rejectNext) {
        rejectNext(err);
        resolveNext = null;
        rejectNext = null;
      } else {
        errorQueue.push(err);
      }
    };

    this.emitter.on('move', scheduleEvent);
    this.emitter.on('error', errorHandler);
    signal?.addEventListener('abort', abortHandler);

    try {
      while (true) {
        if (signal?.aborted) {
          throw new MouseError('The operation was aborted.');
        }

        if (errorQueue.length > 0) {
          throw errorQueue.shift();
        }

        if (latestEvent !== null && timeoutId === null) {
          const ev = latestEvent;
          latestEvent = null;
          yield ev;
        } else {
          // This is an async generator, await in loop is necessary
          yield await new Promise<MouseEvent>((resolve, reject) => {
            resolveNext = resolve;
            rejectNext = reject;
          });
        }
      }
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      this.emitter.off('move', scheduleEvent);
      this.emitter.off('error', errorHandler);
      signal?.removeEventListener('abort', abortHandler);
    }
  }

  /**
   * Returns an async generator that yields all mouse events.
   *
   * @param options Configuration for the event stream
   * @yields Objects containing the event type and event data
   */
  public async *stream({
    latestOnly = false,
    maxQueue = 1000,
    signal,
  }: {
    latestOnly?: boolean;
    maxQueue?: number;
    signal?: AbortSignal;
  } = {}): AsyncGenerator<{ type: MouseEventAction; event: MouseEvent }> {
    if (signal?.aborted) {
      throw new Error('The operation was aborted.');
    }

    const queue: { type: MouseEventAction; event: MouseEvent }[] = [];
    const errorQueue: Error[] = [];
    let latest: { type: MouseEventAction; event: MouseEvent } | null = null;
    let resolveNext: ((value: { type: MouseEventAction; event: MouseEvent }) => void) | null = null;
    let rejectNext: ((err: Error) => void) | null = null;

    const handlers = new Map<MouseEventAction, (ev: MouseEvent) => void>();
    const allEvents: MouseEventAction[] = ['press', 'release', 'drag', 'wheel', 'move', 'click'];

    allEvents.forEach((type) => {
      const handler = (ev: MouseEvent): void => {
        const wrapped = { type, event: ev };

        if (resolveNext) {
          resolveNext(wrapped);
          resolveNext = null;
          rejectNext = null;
          latest = null;
        } else if (latestOnly) {
          latest = wrapped;
        } else {
          if (queue.length >= maxQueue) queue.shift();
          queue.push(wrapped);
        }
      };

      handlers.set(type, handler);
      this.emitter.on(type, handler);
    });

    const errorHandler = (err: Error): void => {
      const mouseError = new MouseError(`Error in mouse event stream: ${err.message}`, err);
      if (rejectNext) {
        rejectNext(mouseError);
        resolveNext = null;
        rejectNext = null;
      } else {
        errorQueue.push(mouseError);
      }
    };
    this.emitter.on('error', errorHandler);

    const abortHandler = (): void => {
      const err = new MouseError('The operation was aborted.');
      if (rejectNext) {
        rejectNext(err);
        resolveNext = null;
        rejectNext = null;
      } else {
        errorQueue.push(err);
      }
    };
    signal?.addEventListener('abort', abortHandler);

    try {
      while (true) {
        if (signal?.aborted) {
          throw new MouseError('The operation was aborted.');
        }

        if (errorQueue.length > 0) {
          throw errorQueue.shift();
        }

        if (queue.length > 0) {
          const event = queue.shift();
          if (event) {
            yield event;
          }
        } else if (latest !== null) {
          const ev = latest;
          latest = null;
          yield ev;
        } else {
          // This is an async generator, await in loop is necessary
          yield await new Promise<{ type: MouseEventAction; event: MouseEvent }>((resolve, reject) => {
            resolveNext = resolve;
            rejectNext = reject;
          });
        }
      }
    } finally {
      allEvents.forEach((type) => {
        const handler = handlers.get(type);
        if (handler) {
          this.emitter.off(type, handler);
        }
      });
      this.emitter.off('error', errorHandler);
      signal?.removeEventListener('abort', abortHandler);
    }
  }
}
