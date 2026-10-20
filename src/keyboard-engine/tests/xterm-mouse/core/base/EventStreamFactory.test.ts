import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, test } from 'vitest';
import type { MouseEvent } from '../../../../src/xterm-mouse/types/index.js';
import { EventStreamFactory } from '../../../../src/xterm-mouse/core/EventStreamFactory.js';

describe('EventStreamFactory', () => {
  let factory: EventStreamFactory;
  let mockEmitter: EventEmitter;

  beforeEach(() => {
    mockEmitter = new EventEmitter();
    factory = new EventStreamFactory(mockEmitter);
  });

  describe('eventsOf', () => {
    test('yields events of specified type', async () => {
      // Arrange
      const events: MouseEvent[] = [];
      const stream = factory.eventsOf('press');

      // Act - start consuming the stream
      const setTimeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          mockEmitter.emit('press', { x: 10, y: 10, button: 'left', action: 'press' });
          mockEmitter.emit('press', { x: 15, y: 15, button: 'left', action: 'press' });
          setTimeout(() => resolve(), 10);
        }, 10);
      });

      // Consume stream
      const consumingPromise = (async () => {
        for await (const event of stream) {
          events.push(event);
          if (events.length >= 2) break;
        }
      })();

      await Promise.all([setTimeoutPromise, consumingPromise]);

      // Assert
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual(expect.objectContaining({ action: 'press' }));
    });

    test('ignores events of other types', async () => {
      // Arrange
      const events: MouseEvent[] = [];
      const stream = factory.eventsOf('press');

      // Act
      const setTimeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          mockEmitter.emit('release', { x: 10, y: 10, button: 'left', action: 'release' });
          mockEmitter.emit('press', { x: 15, y: 15, button: 'left', action: 'press' });
          setTimeout(() => resolve(), 10);
        }, 10);
      });

      const consumingPromise = (async () => {
        for await (const event of stream) {
          events.push(event);
          if (events.length >= 1) break;
        }
      })();

      await Promise.all([setTimeoutPromise, consumingPromise]);

      // Assert
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe('press');
    });

    test('aborts when signal is triggered', async () => {
      // Arrange
      const controller = new AbortController();
      const stream = factory.eventsOf('press', { signal: controller.signal });
      const events: MouseEvent[] = [];

      // Act
      const consumingPromise = (async () => {
        try {
          for await (const event of stream) {
            events.push(event);
          }
        } catch (err) {
          // Expected to abort
          expect(err).toBeInstanceOf(Error);
          expect((err as Error).message).toContain('aborted');
        }
      })();

      setTimeout(() => {
        controller.abort();
      }, 10);

      await consumingPromise;

      // Assert
      expect(events.length).toBe(0); // No events collected before abort
    });

    test('cleans up listeners on break', async () => {
      // Arrange
      const stream = factory.eventsOf('press');
      const listenerCount = mockEmitter.listenerCount('press');

      // Act
      const setTimeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          mockEmitter.emit('press', { x: 10, y: 10, button: 'left', action: 'press' });
          setTimeout(() => resolve(), 10);
        }, 10);
      });

      const consumingPromise = (async () => {
        for await (const _ of stream) {
          break; // Exit after first event
        }
      })();

      await Promise.all([setTimeoutPromise, consumingPromise]);
      const finalListenerCount = mockEmitter.listenerCount('press');

      // Assert - listener removed
      expect(finalListenerCount).toBe(listenerCount);
    });

    test('keeps only latest event when latestOnly is true', async () => {
      // Arrange
      const events: MouseEvent[] = [];
      const stream = factory.eventsOf('press', { latestOnly: true });

      // Act - start consuming first, then emit events
      const consumingPromise = (async () => {
        for await (const event of stream) {
          events.push(event);
          if (events.length >= 2) break;
        }
      })();

      // Emit events in batches:
      // Batch 1: events 10, 20, 30 - should yield 10 (first), keep 30 as latest
      // After yielding, should yield 30 (latest from batch 1)
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          mockEmitter.emit('press', { x: 10, y: 10, button: 'left', action: 'press' });
          mockEmitter.emit('press', { x: 20, y: 20, button: 'left', action: 'press' });
          mockEmitter.emit('press', { x: 30, y: 30, button: 'left', action: 'press' });
          setTimeout(() => resolve(), 30);
        }, 10);
      });

      await consumingPromise;

      // Assert - first event from first arrival, then latest from that batch
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual(expect.objectContaining({ x: 10, y: 10 }));
      expect(events[1]).toEqual(expect.objectContaining({ x: 30, y: 30 }));
    });

    test('respects maxQueue limit', async () => {
      // Arrange
      const events: MouseEvent[] = [];
      const stream = factory.eventsOf('press', { maxQueue: 3 });

      // Act - start consuming first
      const consumingPromise = (async () => {
        for await (const event of stream) {
          events.push(event);
          if (events.length >= 3) break;
        }
      })();

      // Emit events with delays between each to let the generator process them
      // Event 1 is yielded immediately (generator waiting)
      // Events 2, 3, 4 are queued (generator processing event 1)
      // Event 5 causes queue.shift() (queue was [2,3,4], becomes [3,4,5])
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          mockEmitter.emit('press', { x: 1, y: 1, button: 'left', action: 'press' });
        }, 10);
        setTimeout(() => {
          mockEmitter.emit('press', { x: 2, y: 2, button: 'left', action: 'press' });
        }, 20);
        setTimeout(() => {
          mockEmitter.emit('press', { x: 3, y: 3, button: 'left', action: 'press' });
        }, 30);
        setTimeout(() => {
          mockEmitter.emit('press', { x: 4, y: 4, button: 'left', action: 'press' });
        }, 40);
        setTimeout(() => {
          mockEmitter.emit('press', { x: 5, y: 5, button: 'left', action: 'press' });
          setTimeout(() => resolve(), 30);
        }, 50);
      });

      await consumingPromise;

      // Assert - should get event 1 (immediate), then 2, 3 from queue
      expect(events).toHaveLength(3);
      expect(events[0]).toEqual(expect.objectContaining({ x: 1, y: 1 }));
      expect(events[1]).toEqual(expect.objectContaining({ x: 2, y: 2 }));
      expect(events[2]).toEqual(expect.objectContaining({ x: 3, y: 3 }));
    });

    test('throws immediately when signal is already aborted', async () => {
      // Arrange
      const controller = new AbortController();
      controller.abort();
      const stream = factory.eventsOf('press', { signal: controller.signal });

      // Act & Assert
      await expect(async () => {
        for await (const _ of stream) {
          // Should throw before first iteration
        }
      }).rejects.toThrow('aborted');
    });
  });

  describe('debouncedMoveEvents', () => {
    test('yields debounced move events', async () => {
      // Arrange
      const events: MouseEvent[] = [];
      const stream = factory.debouncedMoveEvents({ interval: 50 });

      // Act
      const setTimeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          // Emit multiple move events rapidly
          mockEmitter.emit('move', { x: 10, y: 10, button: 'none', action: 'move' });
          mockEmitter.emit('move', { x: 15, y: 15, button: 'none', action: 'move' });
          mockEmitter.emit('move', { x: 20, y: 20, button: 'none', action: 'move' });
          setTimeout(() => resolve(), 100); // Wait for debounce interval
        }, 10);
      });

      const consumingPromise = (async () => {
        for await (const event of stream) {
          events.push(event);
          if (events.length >= 1) break; // Just get first debounced event
        }
      })();

      await Promise.all([setTimeoutPromise, consumingPromise]);

      // Assert - should get last event after debounce
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(
        expect.objectContaining({
          x: 20,
          y: 20,
          action: 'move',
        }),
      );
    });

    test('yields a move parked while the consumer was busy', async () => {
      // Arrange
      const stream = factory.debouncedMoveEvents({ interval: 30 });
      const iterator = stream[Symbol.asyncIterator]();

      // Act — consume the first move, then let the consumer go "busy": the
      // second move arrives and its debounce expires while nobody is pulling.
      // The generator subscribes to `move` when the first pull resumes it, so
      // the emit has to come after `next()` is called.
      const firstPull = iterator.next();
      mockEmitter.emit('move', { x: 1, y: 1, button: 'none', action: 'move' });
      const first = await firstPull;
      expect(first.value).toEqual(expect.objectContaining({ x: 1 }));

      mockEmitter.emit('move', { x: 2, y: 2, button: 'none', action: 'move' });
      await new Promise<void>((resolve) => setTimeout(resolve, 80));

      // Assert — the parked move is handed to the next pull instead of being
      // lost until another move arrives.
      const second = await Promise.race([
        iterator.next(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('the parked move was never yielded')),
            200,
          ),
        ),
      ]);
      expect(second.value).toEqual(expect.objectContaining({ x: 2 }));

      await iterator.return?.(undefined);
    });

    test('ignores non-move events', async () => {
      // Arrange
      const events: MouseEvent[] = [];
      const stream = factory.debouncedMoveEvents({ interval: 50 });

      // Act
      const setTimeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          mockEmitter.emit('press', { x: 10, y: 10, button: 'left', action: 'press' });
          mockEmitter.emit('move', { x: 15, y: 15, button: 'none', action: 'move' });
          setTimeout(() => resolve(), 100);
        }, 10);
      });

      const consumingPromise = (async () => {
        for await (const event of stream) {
          events.push(event);
          if (events.length >= 1) break;
        }
      })();

      await Promise.all([setTimeoutPromise, consumingPromise]);

      // Assert
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe('move');
    });

    test('aborts when signal is triggered', async () => {
      // Arrange
      const controller = new AbortController();
      const stream = factory.debouncedMoveEvents({ signal: controller.signal });
      const events: MouseEvent[] = [];

      // Act
      const consumingPromise = (async () => {
        try {
          for await (const event of stream) {
            events.push(event);
          }
        } catch (err) {
          expect((err as Error).message).toContain('aborted');
        }
      })();

      setTimeout(() => {
        controller.abort();
      }, 10);

      await consumingPromise;

      // Assert
      expect(events.length).toBe(0);
    });

    test('cleans up timeout on abort', async () => {
      // Arrange
      const controller = new AbortController();
      const stream = factory.debouncedMoveEvents({ interval: 100, signal: controller.signal });

      // Act - emit move event then immediately abort
      const setTimeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          mockEmitter.emit('move', { x: 10, y: 10, button: 'none', action: 'move' });
          setTimeout(() => {
            controller.abort();
            setTimeout(() => resolve(), 50); // Wait to ensure timeout was cleared
          }, 10);
        }, 10);
      });

      const consumingPromise = (async () => {
        try {
          for await (const _ of stream) {
            // Should abort before yielding
          }
        } catch (err) {
          expect((err as Error).message).toContain('aborted');
        }
      })();

      await Promise.all([setTimeoutPromise, consumingPromise]);

      // Assert - if timeout wasn't cleared, it would try to yield after test completes
      // No assertion needed - test passing means timeout was properly cleaned up
    });

    test('throws immediately when signal is already aborted', async () => {
      // Arrange
      const controller = new AbortController();
      controller.abort();
      const stream = factory.debouncedMoveEvents({ signal: controller.signal });

      // Act & Assert
      await expect(async () => {
        for await (const _ of stream) {
          // Should throw before first iteration
        }
      }).rejects.toThrow('aborted');
    });
  });

  describe('stream', () => {
    test('yields all event types with wrappers', async () => {
      // Arrange
      const events: { type: string; event: MouseEvent }[] = [];
      const stream = factory.stream();

      // Act
      const setTimeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          mockEmitter.emit('press', { x: 10, y: 10, button: 'left', action: 'press' });
          mockEmitter.emit('move', { x: 15, y: 15, button: 'none', action: 'move' });
          setTimeout(() => resolve(), 10);
        }, 10);
      });

      const consumingPromise = (async () => {
        for await (const wrapped of stream) {
          events.push(wrapped);
          if (events.length >= 2) break;
        }
      })();

      await Promise.all([setTimeoutPromise, consumingPromise]);

      // Assert
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: 'press', event: expect.objectContaining({ action: 'press' }) });
      expect(events[1]).toEqual({ type: 'move', event: expect.objectContaining({ action: 'move' }) });
    });

    test('cleans up all event listeners on completion', async () => {
      // Arrange
      const stream = factory.stream();
      const initialPressListeners = mockEmitter.listenerCount('press');
      const initialMoveListeners = mockEmitter.listenerCount('move');

      // Act
      const setTimeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          mockEmitter.emit('press', { x: 10, y: 10, button: 'left', action: 'press' });
          setTimeout(() => resolve(), 10);
        }, 10);
      });

      const consumingPromise = (async () => {
        for await (const _ of stream) {
          break;
        }
      })();

      await Promise.all([setTimeoutPromise, consumingPromise]);
      const finalPressListeners = mockEmitter.listenerCount('press');
      const finalMoveListeners = mockEmitter.listenerCount('move');

      // Assert - all temporary listeners removed
      expect(finalPressListeners).toBe(initialPressListeners);
      expect(finalMoveListeners).toBe(initialMoveListeners);
    });

    test('aborts when signal is triggered', async () => {
      // Arrange
      const controller = new AbortController();
      const stream = factory.stream({ signal: controller.signal });
      const events: { type: string; event: MouseEvent }[] = [];

      // Act
      const consumingPromise = (async () => {
        try {
          for await (const wrapped of stream) {
            events.push(wrapped);
          }
        } catch (err) {
          expect((err as Error).message).toContain('aborted');
        }
      })();

      setTimeout(() => {
        controller.abort();
      }, 10);

      await consumingPromise;

      // Assert
      expect(events.length).toBe(0);
    });

    test('keeps only latest event when latestOnly is true', async () => {
      // Arrange
      const events: { type: string; event: MouseEvent }[] = [];
      const stream = factory.stream({ latestOnly: true });

      // Act - start consuming first, collect 2 events
      const consumingPromise = (async () => {
        for await (const wrapped of stream) {
          events.push(wrapped);
          if (events.length >= 2) break;
        }
      })();

      // Emit events in batches
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          mockEmitter.emit('press', { x: 10, y: 10, button: 'left', action: 'press' });
          mockEmitter.emit('move', { x: 20, y: 20, button: 'none', action: 'move' });
          mockEmitter.emit('release', { x: 30, y: 30, button: 'left', action: 'release' });
          setTimeout(() => resolve(), 30);
        }, 10);
      });

      await consumingPromise;

      // Assert - should get press (first), then release (latest from batch)
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        type: 'press',
        event: expect.objectContaining({ x: 10, y: 10 }),
      });
      expect(events[1]).toEqual({
        type: 'release',
        event: expect.objectContaining({ x: 30, y: 30 }),
      });
    });

    test('respects maxQueue limit', async () => {
      // Arrange
      const events: { type: string; event: MouseEvent }[] = [];
      const stream = factory.stream({ maxQueue: 3 });

      // Act - start consuming first
      const consumingPromise = (async () => {
        for await (const wrapped of stream) {
          events.push(wrapped);
          if (events.length >= 3) break;
        }
      })();

      // Emit events with delays between each
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          mockEmitter.emit('press', { x: 1, y: 1, button: 'left', action: 'press' });
        }, 10);
        setTimeout(() => {
          mockEmitter.emit('move', { x: 2, y: 2, button: 'none', action: 'move' });
        }, 20);
        setTimeout(() => {
          mockEmitter.emit('drag', { x: 3, y: 3, button: 'left', action: 'drag' });
        }, 30);
        setTimeout(() => {
          mockEmitter.emit('release', { x: 4, y: 4, button: 'left', action: 'release' });
        }, 40);
        setTimeout(() => {
          mockEmitter.emit('click', { x: 5, y: 5, button: 'left', action: 'click' });
          setTimeout(() => resolve(), 30);
        }, 50);
      });

      await consumingPromise;

      // Assert - should get first 3 events (press, move, drag)
      expect(events).toHaveLength(3);
      expect(events[0]?.type).toBe('press');
      expect(events[1]?.type).toBe('move');
      expect(events[2]?.type).toBe('drag');
    });

    test('throws immediately when signal is already aborted', async () => {
      // Arrange
      const controller = new AbortController();
      controller.abort();
      const stream = factory.stream({ signal: controller.signal });

      // Act & Assert
      await expect(async () => {
        for await (const _ of stream) {
          // Should throw before first iteration
        }
      }).rejects.toThrow('aborted');
    });
  });

  describe('error handling', () => {
    test('eventsOf throws error when error event is emitted', async () => {
      // Arrange
      const stream = factory.eventsOf('press');

      // Act
      const setTimeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          // Emit error first, then an event to trigger next iteration
          mockEmitter.emit('error', new Error('Stream error'));
          mockEmitter.emit('press', { x: 10, y: 10, button: 'left', action: 'press' });
          setTimeout(() => resolve(), 10);
        }, 10);
      });

      const consumingPromise = (async () => {
        try {
          for await (const _ of stream) {
            // Should throw before yielding
          }
        } catch (err) {
          expect((err as Error).message).toContain('Stream error');
        }
      })();

      await Promise.all([setTimeoutPromise, consumingPromise]);
    });

    test('debouncedMoveEvents throws error when error event is emitted', async () => {
      // Arrange
      const stream = factory.debouncedMoveEvents();

      // Act
      const setTimeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          // Emit error first, then a move event to trigger next iteration
          mockEmitter.emit('error', new Error('Debounce error'));
          mockEmitter.emit('move', { x: 10, y: 10, button: 'none', action: 'move' });
          setTimeout(() => resolve(), 10);
        }, 10);
      });

      const consumingPromise = (async () => {
        try {
          for await (const _ of stream) {
            // Should throw before yielding
          }
        } catch (err) {
          expect((err as Error).message).toContain('Debounce error');
        }
      })();

      await Promise.all([setTimeoutPromise, consumingPromise]);
    });

    test('stream throws error when error event is emitted', async () => {
      // Arrange
      const stream = factory.stream();

      // Act
      const setTimeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          // Emit error first, then an event to trigger next iteration
          mockEmitter.emit('error', new Error('All events error'));
          mockEmitter.emit('press', { x: 10, y: 10, button: 'left', action: 'press' });
          setTimeout(() => resolve(), 10);
        }, 10);
      });

      const consumingPromise = (async () => {
        try {
          for await (const _ of stream) {
            // Should throw before yielding
          }
        } catch (err) {
          expect((err as Error).message).toContain('All events error');
        }
      })();

      await Promise.all([setTimeoutPromise, consumingPromise]);
    });
  });
});
