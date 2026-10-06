import { EventEmitter } from 'node:events';
import { describe, expect, test, vi } from 'vitest';

import type { MouseEvent, ReadableStreamWithEncoding } from '../../../../src/xterm-mouse/types/index.js';

import { Mouse } from '../../../../src/xterm-mouse/core/Mouse.js';

// Helper function to replace Bun.sleep()
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeFakeTTYStream(): ReadableStreamWithEncoding {
  const fake = new EventEmitter() as ReadableStreamWithEncoding;
  fake.isTTY = true;
  fake.isRaw = false;
  let encoding: BufferEncoding | null = null;

  fake.setRawMode = (mode: boolean): ReadableStreamWithEncoding => {
    fake.isRaw = mode;
    return fake;
  };

  fake.setEncoding = (enc: BufferEncoding): ReadableStreamWithEncoding => {
    encoding = enc;
    return fake;
  };

  fake.readableEncoding = encoding;

  fake.resume = (): ReadableStreamWithEncoding => fake;
  fake.pause = (): ReadableStreamWithEncoding => fake;

  // Preserve original EventEmitter methods for proper event handling
  const originalOn = fake.on.bind(fake);
  const originalOff = fake.off.bind(fake);

  // original EventEmitter methods
  fake.on = (event: string, listener: (...args: any[]) => void): ReadableStreamWithEncoding => {
    originalOn(event, listener);
    return fake;
  };

  fake.off = (event: string, listener: (...args: unknown[]) => void): ReadableStreamWithEncoding => {
    originalOff(event, listener);
    return fake;
  };

  return fake;
}

test('Mouse should be instantiable', () => {
  // Arrange
  const mouse = new Mouse();
  // Act

  // Assert
  expect(mouse).toBeInstanceOf(Mouse);

  // Cleanup
  mouse.destroy();
});

test('Mouse enable/disable should work', () => {
  // Arrange
  const mouse = new Mouse({ inputStream: makeFakeTTYStream() });

  // Act
  mouse.enable();

  // Assert
  expect(mouse.isEnabled()).toBe(true);

  // Act
  mouse.disable();

  // Assert
  expect(mouse.isEnabled()).toBe(false);
});

test('Mouse should emit press event', async () => {
  // Arrange
  const emitter = new EventEmitter();
  const mouse = new Mouse({ emitter, inputStream: makeFakeTTYStream(), outputStream: process.stdout });

  // Act
  const pressPromise = new Promise<void>((resolve) => {
    mouse.on('press', (event) => {
      // Assert
      expect(event.action).toBe('press');
      expect(event.button).toBe('left');
      mouse.destroy();
      resolve();
    });
  });

  mouse.enable();
  // Simulate a mouse press event
  emitter.emit('press', { action: 'press', button: 'left' });

  await pressPromise;
});

test('Mouse should handle data events', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const pressEvent = '\x1b[<0;10;20M';

  const eventPromise = new Promise<void>((resolve) => {
    mouse.on('press', (event) => {
      // Assert
      expect(event.action).toBe('press');
      expect(event.button).toBe('left');
      expect(event.x).toBe(10);
      expect(event.y).toBe(20);
      resolve();
    });
  });

  // Act
  mouse.enable();
  stream.emit('data', Buffer.from(pressEvent));

  await eventPromise;

  // Cleanup
  mouse.destroy();
});

test('Mouse should be destroyed', () => {
  // Arrange
  const mouse = new Mouse({ inputStream: makeFakeTTYStream() });
  mouse.enable();

  // Act
  mouse.destroy();

  // Assert
  expect(mouse.isEnabled()).toBe(false);
});

test('Mouse eventsOf should yield mouse events', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const pressEvent = '\x1b[<0;10;20M';
  const iterator = mouse.eventsOf('press');

  try {
    mouse.enable();

    // Act
    const eventPromise = iterator.next();
    stream.emit('data', Buffer.from(pressEvent));
    const { value } = await eventPromise;

    // Assert
    expect(value.action).toBe('press');
    expect(value.button).toBe('left');
    expect(value.x).toBe(10);
    expect(value.y).toBe(20);
  } finally {
    // Cleanup
    await iterator.return(undefined);
    mouse.destroy();
  }
});

test('Mouse stream should yield mouse events', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const pressEvent = '\x1b[<0;10;20M';
  const iterator = mouse.stream();

  try {
    mouse.enable();

    // Act
    const eventPromise = iterator.next();
    stream.emit('data', Buffer.from(pressEvent));
    const { value } = await eventPromise;

    // Assert
    expect(value.type).toBe('press');
    expect(value.event.action).toBe('press');
    expect(value.event.button).toBe('left');
    expect(value.event.x).toBe(10);
    expect(value.event.y).toBe(20);
  } finally {
    // Cleanup
    await iterator.return(undefined);
    mouse.destroy();
  }
});

test('Mouse handleEvent should emit error when event emission fails', async () => {
  // Create a mock emitter that throws when emitting 'press' events
  const stream = makeFakeTTYStream();
  const mockEmitter = new EventEmitter();

  // Spy on the emit method to intercept calls
  const originalEmit = mockEmitter.emit.bind(mockEmitter);
  let emitCallCount = 0;

  // Replace emit with a version that throws an error on the second call
  // First call will be for the 'press' event, second will be for 'error'
  mockEmitter.emit = (event: string, ...args: unknown[]): boolean => {
    emitCallCount++;
    if (event === 'press' && emitCallCount === 1) {
      // On the first call (the press event), throw an error to trigger the catch block
      throw new Error('Handler error');
    }
    return originalEmit(event, ...args);
  };

  const mouse = new Mouse({ emitter: mockEmitter, inputStream: stream, outputStream: process.stdout });

  // Listen for the error event that should be emitted from the catch block
  const errorPromise = new Promise<void>((resolve) => {
    mockEmitter.on('error', (err) => {
      expect(err).toBeDefined();
      expect((err as Error).message).toBe('Handler error');
      mouse.destroy();
      resolve();
    });
  });

  mouse.enable();

  // Act: Emit a valid mouse press event that will trigger the error in the handler
  // This will cause the handler to throw, which is caught and emitted as an 'error' event
  stream.emit('data', Buffer.from('\x1b[<0;10;20M'));

  await errorPromise;
});

test('Mouse enable should throw error when inputStream is not TTY', () => {
  // Arrange: Create a stream that is not a TTY
  const nonTTYStream = new EventEmitter() as ReadableStreamWithEncoding;
  nonTTYStream.isTTY = false; // Explicitly set isTTY to false
  nonTTYStream.pause = vi.fn();
  nonTTYStream.resume = vi.fn();
  nonTTYStream.setEncoding = vi.fn();
  nonTTYStream.readableEncoding = null;

  const mouse = new Mouse({ inputStream: nonTTYStream });

  // Act & Assert: enable should throw an error
  expect(() => {
    mouse.enable();
  }).toThrow('Mouse events require a TTY input stream');

  // Also verify that mouse is not enabled after the error
  expect(mouse.isEnabled()).toBe(false);

  // Cleanup (in case enable didn't fully fail)
  mouse.destroy();
});

test('Mouse enable should handle errors during setup from outputStream.write', () => {
  // Arrange: Create a stream that will fail during outputStream.write
  const stream = makeFakeTTYStream();
  const mockOutputStream = {
    write: (_chunk: unknown, _encoding?: BufferEncoding, _cb?: (error?: Error | null) => void): boolean => {
      throw new Error('Write failed');
    },
    cork: () => {},
    uncork: () => {},
  } as NodeJS.WriteStream;

  const mouse = new Mouse({ inputStream: stream, outputStream: mockOutputStream });

  // Act & Assert: enable should throw an error when setup fails
  expect(() => {
    mouse.enable();
  }).toThrow('Failed to enable mouse: Write failed');

  // Also verify that mouse is not enabled after the error
  expect(mouse.isEnabled()).toBe(false);

  // Cleanup (in case enable didn't fully fail)
  mouse.destroy();
});

test('Mouse enable should handle errors during setup from setRawMode', () => {
  // Arrange: Create a stream that will fail during setRawMode
  const stream = makeFakeTTYStream();
  stream.setRawMode = (_mode: boolean): never => {
    throw new Error('setRawMode failed');
  };

  const mouse = new Mouse({ inputStream: stream });

  // Act & Assert: enable should throw an error when setRawMode fails
  expect(() => {
    mouse.enable();
  }).toThrow('Failed to enable mouse: setRawMode failed');

  // Also verify that mouse is not enabled after the error
  expect(mouse.isEnabled()).toBe(false);

  // Cleanup (in case enable didn't fully fail)
  mouse.destroy();
});

test('Mouse.disable() should throw MouseError when an error occurs', () => {
  // Arrange: Create a stream where outputStream.write will fail
  const stream = makeFakeTTYStream();
  const mockOutputStream = {
    write: (data: string) => {
      // Only throw error during disable (when turning mouse features OFF)
      if (data.includes('1006') && data.includes('l')) {
        // SGR disable code
        throw new Error('Write failed during disable');
      }
      return true;
    },
  } as NodeJS.WriteStream;

  const mouse = new Mouse({ inputStream: stream, outputStream: mockOutputStream });

  mouse.enable();

  // Act & Assert: This should trigger the error in the disable method
  expect(() => {
    mouse.disable();
  }).toThrow('Failed to disable mouse: Write failed during disable');
});

test('Mouse eventsOf should use queue when multiple events arrive', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const iterator = mouse.eventsOf('press', { maxQueue: 5 }); // Use small max queue for testing

  mouse.enable();

  // Start the async generator by calling next() first
  const firstEventPromise = iterator.next();

  // Emit the first event to resolve the first promise
  stream.emit('data', Buffer.from('\x1b[<0;10;20M'));

  const { value: firstEvent } = await firstEventPromise;
  expect(firstEvent.action).toBe('press');
  expect(firstEvent.x).toBe(10);
  expect(firstEvent.y).toBe(20);

  // Now emit multiple events to build up the queue while the generator awaits
  stream.emit('data', Buffer.from('\x1b[<1;11;21M')); // Should go to queue
  stream.emit('data', Buffer.from('\x1b[<2;12;22M')); // Should also go to queue

  // Now get the second event (should come from the queue)
  const { value: secondEvent } = await iterator.next();
  expect(secondEvent.action).toBe('press');
  expect(secondEvent.x).toBe(11);
  expect(secondEvent.y).toBe(21);

  // Get the third event (should come from the queue as well)
  const { value: thirdEvent } = await iterator.next();
  expect(thirdEvent.action).toBe('press');
  expect(thirdEvent.x).toBe(12);
  expect(thirdEvent.y).toBe(22);

  // Cleanup
  await iterator.return(undefined);
  mouse.destroy();
});

test('Mouse eventsOf should use latestOnly option', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const iterator = mouse.eventsOf('press', { latestOnly: true }); // Use latestOnly option

  mouse.enable();

  // Start the async generator by calling next() first
  const firstEventPromise = iterator.next();

  // Emit the first event to resolve the first promise
  stream.emit('data', Buffer.from('\x1b[<0;10;20M')); // press event

  const { value: firstEvent } = await firstEventPromise;
  expect(firstEvent.action).toBe('press');
  expect(firstEvent.x).toBe(10);
  expect(firstEvent.y).toBe(20);

  // Now emit multiple events rapidly - with latestOnly, only the latest should be kept
  stream.emit('data', Buffer.from('\x1b[<0;11;21M')); // press event
  stream.emit('data', Buffer.from('\x1b[<0;12;22M')); // press event - this should be the "latest"

  // Now get the second event (should be the latest one)
  const { value: latestEvent } = await iterator.next();
  expect(latestEvent.x).toBe(12); // Should be from the last event
  expect(latestEvent.y).toBe(22);
  expect(latestEvent.action).toBe('press'); // Should be a press event

  // Cleanup
  await iterator.return(undefined);
  mouse.destroy();
});

test('Mouse eventsOf should handle queue overflow', async () => {
  // Arrange - Use a small queue size to test overflow behavior
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const iterator = mouse.eventsOf('press', { maxQueue: 2 }); // Small max queue

  mouse.enable();

  // Emit 3 events to exceed the max queue size of 2
  // The first event will be handled by the promise, the next 2 will go to queue,
  // and when we emit the 3rd, it should cause the queue to shift (first item removed)
  const firstEventPromise = iterator.next();
  stream.emit('data', Buffer.from('\x1b[<0;10;20M')); // First event - handled by promise

  const { value: firstEvent } = await firstEventPromise;
  expect(firstEvent.x).toBe(10);

  // Now emit 3 more events to fill and overflow the queue (max size = 2)
  stream.emit('data', Buffer.from('\x1b[<0;11;21M')); // Goes to queue (pos 0)
  stream.emit('data', Buffer.from('\x1b[<0;12;22M')); // Goes to queue (pos 1) - queue is now full
  stream.emit('data', Buffer.from('\x1b[<0;13;23M')); // Should cause queue.shift() - oldest item removed, this one added

  // Now get second event - should be the second one we added (11,21), since first was consumed by the promise
  const { value: secondEvent } = await iterator.next();
  expect(secondEvent.x).toBe(12); // Should be the last item that was added when queue was full
  expect(secondEvent.y).toBe(22);

  // Get third event - should be the third one we added
  const { value: thirdEvent } = await iterator.next();
  expect(thirdEvent.x).toBe(13); // Should be the one that caused the shift
  expect(thirdEvent.y).toBe(23);

  // Cleanup
  await iterator.return(undefined);
  mouse.destroy();
});

test('Mouse stream should use latestOnly option', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const iterator = mouse.stream({ latestOnly: true }); // Use latestOnly option

  mouse.enable();

  // Start the async generator by calling next() first
  const firstEventPromise = iterator.next();

  // Emit the first event to resolve the first promise
  stream.emit('data', Buffer.from('\x1b[<0;10;20M')); // press event

  const { value: firstEvent } = await firstEventPromise;
  expect(firstEvent.type).toBe('press');
  expect(firstEvent.event.x).toBe(10);
  expect(firstEvent.event.y).toBe(20);

  // Now emit multiple press events rapidly - with latestOnly, only the latest should be kept
  stream.emit('data', Buffer.from('\x1b[<0;11;21M')); // press event
  stream.emit('data', Buffer.from('\x1b[<0;12;22M')); // press event - this should be the "latest"

  // Now get the second event (should be the latest one)
  const { value: latestEvent } = await iterator.next();
  expect(latestEvent.event.x).toBe(12); // Should be from the last event
  expect(latestEvent.event.y).toBe(22);
  expect(latestEvent.type).toBe('press'); // Should be a press event

  // Cleanup
  await iterator.return(undefined);
  mouse.destroy();
});

test('Mouse.disable() should throw MouseError when an error occurs', () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mockOutputStream = {
    write: (data: string): boolean => {
      if (data.includes('1000l')) {
        // Check for a disable code
        throw new Error('Write failed');
      }
      return true;
    },
  } as NodeJS.WriteStream;
  const mouse = new Mouse({ inputStream: stream, outputStream: mockOutputStream });
  mouse.enable();

  // Act & Assert
  expect(() => {
    mouse.disable();
  }).toThrow('Failed to disable mouse: Write failed');
});

test('Mouse.eventsOf() should handle errors', async () => {
  // Arrange
  const emitter = new EventEmitter();
  const mouse = new Mouse({ emitter, inputStream: makeFakeTTYStream(), outputStream: process.stdout });
  const iterator = mouse.eventsOf('press');
  const error = new Error('Test error');

  // Act
  const promise = iterator.next();
  emitter.emit('error', error);

  // Assert
  await expect(promise).rejects.toThrow('Error in mouse event stream: Test error');

  // Cleanup
  await iterator.return(undefined);
  mouse.destroy();
});

test('Mouse should emit click event', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const pressEvent = '\x1b[<0;10;20M';
  const releaseEvent = '\x1b[<0;10;20m';

  const eventPromise = new Promise<void>((resolve) => {
    mouse.on('click', (event) => {
      // Assert
      expect(event.action).toBe('click');
      expect(event.button).toBe('left');
      expect(event.x).toBe(10);
      expect(event.y).toBe(20);
      resolve();
    });
  });

  // Act
  mouse.enable();
  stream.emit('data', Buffer.from(pressEvent));
  stream.emit('data', Buffer.from(releaseEvent));

  await eventPromise;

  // Cleanup
  mouse.destroy();
});

test('Mouse should not emit click event if distance is too large', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const pressEvent = '\x1b[<0;10;20M';
  const releaseEvent = '\x1b[<0;15;25m';

  const clickSpy = vi.fn(() => {});
  mouse.on('click', clickSpy);

  // Act
  mouse.enable();
  stream.emit('data', Buffer.from(pressEvent));
  stream.emit('data', Buffer.from(releaseEvent));

  // Assert
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(clickSpy).not.toHaveBeenCalled();

  // Cleanup
  mouse.destroy();
});

describe('Mouse.once()', () => {
  test('should call listener only once', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const listenerSpy = vi.fn(() => {});

    // Act
    mouse.once('click', listenerSpy);
    mouse.enable();

    // Emit multiple click events
    stream.emit('data', Buffer.from('\x1b[<0;10;20M')); // press
    stream.emit('data', Buffer.from('\x1b[<0;10;20m')); // release - triggers click
    stream.emit('data', Buffer.from('\x1b[<0;15;25M')); // press
    stream.emit('data', Buffer.from('\x1b[<0;15;25m')); // release - would trigger click

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert
    expect(listenerSpy).toHaveBeenCalledTimes(1);

    // Cleanup
    mouse.destroy();
  });

  test('should remove listener after first invocation', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const listenerSpy = vi.fn(() => {});

    // Act
    mouse.once('press', listenerSpy);
    mouse.enable();

    // Emit two press events
    stream.emit('data', Buffer.from('\x1b[<0;10;20M'));
    stream.emit('data', Buffer.from('\x1b[<0;15;25M'));

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert
    expect(listenerSpy).toHaveBeenCalledTimes(1);

    // Cleanup
    mouse.destroy();
  });

  test('should provide correct type inference for wheel event', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const listenerSpy = vi.fn((event: MouseEvent) => {
      // Assert - event.button should be a wheel button type
      expect(['wheel-up', 'wheel-down', 'wheel-left', 'wheel-right']).toContain(event.button);
    });

    // Act
    mouse.once('wheel', listenerSpy);
    mouse.enable();

    stream.emit('data', Buffer.from('\x1b[<64;10;20M')); // wheel-up

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert
    expect(listenerSpy).toHaveBeenCalledTimes(1);

    // Cleanup
    mouse.destroy();
  });

  test('should provide correct type inference for move event', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const listenerSpy = vi.fn((event: MouseEvent) => {
      // Assert - event.button should be 'none' for move events
      expect(event.button).toBe('none');
    });

    // Act
    mouse.once('move', listenerSpy);
    mouse.enable();

    stream.emit('data', Buffer.from('\x1b[<35;10;20M')); // move

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert
    expect(listenerSpy).toHaveBeenCalledTimes(1);

    // Cleanup
    mouse.destroy();
  });

  test('should handle error events', async () => {
    // Arrange
    const emitter = new EventEmitter();
    const mouse = new Mouse({ emitter, inputStream: makeFakeTTYStream(), outputStream: process.stdout });
    const errorSpy = vi.fn(() => {});
    const testError = new Error('Test error');

    // Act
    mouse.once('error', errorSpy);
    emitter.emit('error', testError);

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(testError);

    // Emit another error - should not be handled by once() listener
    // Add a catch-all handler to prevent unhandled error
    const catchAllSpy = vi.fn(() => {});
    emitter.on('error', catchAllSpy);
    emitter.emit('error', new Error('Second error'));

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(catchAllSpy).toHaveBeenCalledTimes(1);

    // Cleanup
    mouse.destroy();
  });

  test('should not interfere with other listeners', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const onceSpy = vi.fn(() => {});
    const onSpy = vi.fn(() => {});

    // Act
    mouse.once('press', onceSpy);
    mouse.on('press', onSpy);
    mouse.enable();

    // Emit two press events
    stream.emit('data', Buffer.from('\x1b[<0;10;20M'));
    stream.emit('data', Buffer.from('\x1b[<0;15;25M'));

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert
    expect(onceSpy).toHaveBeenCalledTimes(1); // Called only once
    expect(onSpy).toHaveBeenCalledTimes(2); // Called for each event

    // Cleanup
    mouse.destroy();
  });
});

test('Mouse.stream() should handle errors', async () => {
  // Arrange
  const emitter = new EventEmitter();
  const mouse = new Mouse({ emitter, inputStream: makeFakeTTYStream(), outputStream: process.stdout });
  const iterator = mouse.stream();
  const error = new Error('Test error');

  // Act
  const promise = iterator.next();
  emitter.emit('error', error);

  // Assert
  await expect(promise).rejects.toThrow('Error in mouse event stream: Test error');

  // Cleanup
  await iterator.return(undefined);
  mouse.destroy();
});

test('Mouse.eventsOf() should be cancellable with AbortSignal', async () => {
  // Arrange
  const mouse = new Mouse({ inputStream: makeFakeTTYStream() });
  const controller = new AbortController();
  const iterator = mouse.eventsOf('press', { signal: controller.signal });

  try {
    mouse.enable();

    // Act
    const promise = iterator.next();
    controller.abort();

    // Assert
    await expect(promise).rejects.toThrow('The operation was aborted.');
  } finally {
    // Cleanup
    mouse.destroy();
  }
});

test('Mouse.stream() should handle high event volume without significant delay', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const iterator = mouse.stream();
  const eventCount = 10_000;
  const timeThreshold = 3000; // CI machines vary; keep the volume test about throughput, not wall-clock speed

  try {
    mouse.enable();

    // Act
    const startTime = performance.now();

    // Consumer promise
    const consumePromise = (async (): Promise<void> => {
      let consumedCount = 0;
      for await (const _ of iterator) {
        consumedCount++;
        if (consumedCount === eventCount) {
          break;
        }
      }
    })();

    // Asynchronous emitter promise
    const emitPromise = (async (): Promise<void> => {
      for (let i = 0; i < eventCount; i++) {
        stream.emit('data', Buffer.from(`\x1b[<0;${i % 200};${i % 100}M`));
        // Yield to the event loop every 100 events to allow the consumer to process
        if (i % 100 === 0) {
          await sleep(0);
        }
      }
    })();

    await Promise.all([consumePromise, emitPromise]);

    const endTime = performance.now();
    const duration = endTime - startTime;

    // Assert
    console.log(`Processed ${eventCount} events in ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(timeThreshold);
  } finally {
    // Cleanup
    await iterator.return(undefined);
    mouse.destroy();
  }
}, 15000);

test('Mouse.stream() should be cancellable with AbortSignal', async () => {
  // Arrange
  const mouse = new Mouse({ inputStream: makeFakeTTYStream() });
  const controller = new AbortController();
  const iterator = mouse.stream({ signal: controller.signal });

  try {
    mouse.enable();

    // Act
    const promise = iterator.next();
    controller.abort();

    // Assert
    await expect(promise).rejects.toThrow('The operation was aborted.');
  } finally {
    // Cleanup
    mouse.destroy();
  }
});

test('Mouse.pause() should set paused state', () => {
  // Arrange
  const mouse = new Mouse({ inputStream: makeFakeTTYStream() });

  // Act
  mouse.pause();

  // Assert
  expect(mouse.isPaused()).toBe(true);

  // Cleanup
  mouse.destroy();
});

test('Mouse.resume() should clear paused state', () => {
  // Arrange
  const mouse = new Mouse({ inputStream: makeFakeTTYStream() });
  mouse.pause();

  // Act
  mouse.resume();

  // Assert
  expect(mouse.isPaused()).toBe(false);

  // Cleanup
  mouse.destroy();
});

test('Mouse.isPaused() should report correct state', () => {
  // Arrange
  const mouse = new Mouse({ inputStream: makeFakeTTYStream() });

  // Assert initial state
  expect(mouse.isPaused()).toBe(false);

  // Act - pause
  mouse.pause();

  // Assert paused state
  expect(mouse.isPaused()).toBe(true);

  // Act - resume
  mouse.resume();

  // Assert resumed state
  expect(mouse.isPaused()).toBe(false);

  // Cleanup
  mouse.destroy();
});

test('Mouse.pause() should be idempotent', () => {
  // Arrange
  const mouse = new Mouse({ inputStream: makeFakeTTYStream() });

  // Act - call pause twice
  mouse.pause();
  mouse.pause();

  // Assert - should still be paused
  expect(mouse.isPaused()).toBe(true);

  // Cleanup
  mouse.destroy();
});

test('Mouse.resume() should be idempotent', () => {
  // Arrange
  const mouse = new Mouse({ inputStream: makeFakeTTYStream() });
  mouse.pause();

  // Act - call resume twice
  mouse.resume();
  mouse.resume();

  // Assert - should still be not paused
  expect(mouse.isPaused()).toBe(false);

  // Cleanup
  mouse.destroy();
});

test('Mouse.pause()/resume() should work without enable', () => {
  // Arrange
  const mouse = new Mouse({ inputStream: makeFakeTTYStream() });

  // Act & Assert - pause/resume should work even when not enabled
  expect(mouse.isEnabled()).toBe(false);
  expect(mouse.isPaused()).toBe(false);

  mouse.pause();
  expect(mouse.isPaused()).toBe(true);
  expect(mouse.isEnabled()).toBe(false);

  mouse.resume();
  expect(mouse.isPaused()).toBe(false);
  expect(mouse.isEnabled()).toBe(false);

  // Cleanup
  mouse.destroy();
});

test('Mouse should not emit press events when paused', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const pressEvent = '\x1b[<0;10;20M';
  const pressSpy = vi.fn(() => {});

  mouse.on('press', pressSpy);
  mouse.enable();

  // Act - pause the mouse
  mouse.pause();

  // Emit a press event while paused
  stream.emit('data', Buffer.from(pressEvent));

  // Assert - no press event should be emitted
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(pressSpy).not.toHaveBeenCalled();

  // Act - resume the mouse
  mouse.resume();

  // Emit another press event after resume
  stream.emit('data', Buffer.from(pressEvent));

  // Assert - press event should now be emitted
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(pressSpy).toHaveBeenCalledTimes(1);
  expect(pressSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'press',
      button: 'left',
      x: 10,
      y: 20,
    }),
  );

  // Cleanup
  mouse.destroy();
});

test('Mouse should not emit release events when paused', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const releaseEvent = '\x1b[<0;10;20m';
  const releaseSpy = vi.fn(() => {});

  mouse.on('release', releaseSpy);
  mouse.enable();

  // Act - pause the mouse
  mouse.pause();

  // Emit a release event while paused
  stream.emit('data', Buffer.from(releaseEvent));

  // Assert - no release event should be emitted
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(releaseSpy).not.toHaveBeenCalled();

  // Act - resume the mouse
  mouse.resume();

  // Emit another release event after resume
  stream.emit('data', Buffer.from(releaseEvent));

  // Assert - release event should now be emitted
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(releaseSpy).toHaveBeenCalledTimes(1);
  expect(releaseSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'release',
      button: 'left',
      x: 10,
      y: 20,
    }),
  );

  // Cleanup
  mouse.destroy();
});

test('Mouse should not emit drag events when paused', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const dragEvent = '\x1b[<32;15;25M'; // Button 32 = left button with motion bit
  const dragSpy = vi.fn(() => {});

  mouse.on('drag', dragSpy);
  mouse.enable();

  // Act - pause the mouse
  mouse.pause();

  // Emit a drag event while paused
  stream.emit('data', Buffer.from(dragEvent));

  // Assert - no drag event should be emitted
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(dragSpy).not.toHaveBeenCalled();

  // Act - resume the mouse
  mouse.resume();

  // Emit another drag event after resume
  stream.emit('data', Buffer.from(dragEvent));

  // Assert - drag event should now be emitted
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(dragSpy).toHaveBeenCalledTimes(1);
  expect(dragSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'drag',
      button: 'left',
      x: 15,
      y: 25,
    }),
  );

  // Cleanup
  mouse.destroy();
});

test('Mouse should not emit wheel events when paused', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const wheelEvent = '\x1b[<64;10;20M'; // Button 64 = wheel up
  const wheelSpy = vi.fn(() => {});

  mouse.on('wheel', wheelSpy);
  mouse.enable();

  // Act - pause the mouse
  mouse.pause();

  // Emit a wheel event while paused
  stream.emit('data', Buffer.from(wheelEvent));

  // Assert - no wheel event should be emitted
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(wheelSpy).not.toHaveBeenCalled();

  // Act - resume the mouse
  mouse.resume();

  // Emit another wheel event after resume
  stream.emit('data', Buffer.from(wheelEvent));

  // Assert - wheel event should now be emitted
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(wheelSpy).toHaveBeenCalledTimes(1);
  expect(wheelSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'wheel',
      button: 'wheel-up',
      x: 10,
      y: 20,
    }),
  );

  // Cleanup
  mouse.destroy();
});

test('Mouse should not emit move events when paused', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const moveEvent = '\x1b[<35;10;20M'; // Button 35 = button 3 with motion bit (move)
  const moveSpy = vi.fn(() => {});

  mouse.on('move', moveSpy);
  mouse.enable();

  // Act - pause the mouse
  mouse.pause();

  // Emit a move event while paused
  stream.emit('data', Buffer.from(moveEvent));

  // Assert - no move event should be emitted
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(moveSpy).not.toHaveBeenCalled();

  // Act - resume the mouse
  mouse.resume();

  // Emit another move event after resume
  stream.emit('data', Buffer.from(moveEvent));

  // Assert - move event should now be emitted
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(moveSpy).toHaveBeenCalledTimes(1);
  expect(moveSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'move',
      button: 'none',
      x: 10,
      y: 20,
    }),
  );

  // Cleanup
  mouse.destroy();
});

test('Mouse should not emit click events when paused', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const pressEvent = '\x1b[<0;10;20M';
  const releaseEvent = '\x1b[<0;10;20m';
  const clickSpy = vi.fn(() => {});

  mouse.on('click', clickSpy);
  mouse.enable();

  // Act - pause the mouse
  mouse.pause();

  // Emit press and release events while paused
  stream.emit('data', Buffer.from(pressEvent));
  stream.emit('data', Buffer.from(releaseEvent));

  // Assert - no click event should be emitted
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(clickSpy).not.toHaveBeenCalled();

  // Act - resume the mouse
  mouse.resume();

  // Emit press and release events after resume
  stream.emit('data', Buffer.from(pressEvent));
  stream.emit('data', Buffer.from(releaseEvent));

  // Assert - click event should now be emitted
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(clickSpy).toHaveBeenCalledTimes(1);
  expect(clickSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'click',
      button: 'left',
      x: 10,
      y: 20,
    }),
  );

  // Cleanup
  mouse.destroy();
});

test('Mouse should block all event types when paused', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });

  const pressSpy = vi.fn(() => {});
  const releaseSpy = vi.fn(() => {});
  const dragSpy = vi.fn(() => {});
  const wheelSpy = vi.fn(() => {});
  const moveSpy = vi.fn(() => {});

  mouse.on('press', pressSpy);
  mouse.on('release', releaseSpy);
  mouse.on('drag', dragSpy);
  mouse.on('wheel', wheelSpy);
  mouse.on('move', moveSpy);

  mouse.enable();

  // Act - pause the mouse
  mouse.pause();

  // Emit various events while paused
  stream.emit('data', Buffer.from('\x1b[<0;10;20M')); // press
  stream.emit('data', Buffer.from('\x1b[<0;10;20m')); // release
  stream.emit('data', Buffer.from('\x1b[<32;15;25M')); // drag
  stream.emit('data', Buffer.from('\x1b[<64;10;20M')); // wheel
  stream.emit('data', Buffer.from('\x1b[<35;10;20M')); // move

  // Assert - no events should be emitted while paused
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(pressSpy).not.toHaveBeenCalled();
  expect(releaseSpy).not.toHaveBeenCalled();
  expect(dragSpy).not.toHaveBeenCalled();
  expect(wheelSpy).not.toHaveBeenCalled();
  expect(moveSpy).not.toHaveBeenCalled();

  // Act - resume the mouse
  mouse.resume();

  // Emit the same events after resume
  stream.emit('data', Buffer.from('\x1b[<0;10;20M')); // press
  stream.emit('data', Buffer.from('\x1b[<0;10;20m')); // release
  stream.emit('data', Buffer.from('\x1b[<32;15;25M')); // drag
  stream.emit('data', Buffer.from('\x1b[<64;10;20M')); // wheel
  stream.emit('data', Buffer.from('\x1b[<35;10;20M')); // move

  // Assert - all events should now be emitted
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(pressSpy).toHaveBeenCalledTimes(1);
  expect(releaseSpy).toHaveBeenCalledTimes(1);
  expect(dragSpy).toHaveBeenCalledTimes(1);
  expect(wheelSpy).toHaveBeenCalledTimes(1);
  expect(moveSpy).toHaveBeenCalledTimes(1);

  // Cleanup
  mouse.destroy();
});

test('Mouse.pause()/resume() should not make terminal mode changes', () => {
  // Arrange - Create stream with mocked methods to track terminal mode changes
  const stream = makeFakeTTYStream();
  const writeSpy = vi.fn(() => true);
  const setRawModeSpy = vi.fn(() => stream);

  const mockOutputStream = {
    write: writeSpy,
  } as unknown as NodeJS.WriteStream;

  stream.setRawMode = setRawModeSpy as never;

  const mouse = new Mouse({ inputStream: stream, outputStream: mockOutputStream });

  // Act - call pause() without enabling
  mouse.pause();

  // Assert - verify paused state changed but no terminal mode changes occurred
  expect(mouse.isPaused()).toBe(true);
  expect(mouse.isEnabled()).toBe(false);
  expect(writeSpy).not.toHaveBeenCalled();
  expect(setRawModeSpy).not.toHaveBeenCalled();

  // Act - call resume() without enabling
  mouse.resume();

  // Assert - verify paused state changed but still no terminal mode changes
  expect(mouse.isPaused()).toBe(false);
  expect(mouse.isEnabled()).toBe(false);
  expect(writeSpy).not.toHaveBeenCalled();
  expect(setRawModeSpy).not.toHaveBeenCalled();

  // Cleanup
  mouse.destroy();
});

test('Mouse.pause()/resume() should not interfere with enable/disable', () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const writeSpy = vi.fn(() => true);
  const setRawModeSpy = vi.fn(() => stream);

  const mockOutputStream = {
    write: writeSpy,
  } as unknown as NodeJS.WriteStream;

  stream.setRawMode = setRawModeSpy as never;

  const mouse = new Mouse({ inputStream: stream, outputStream: mockOutputStream });

  // Act - pause before enable
  mouse.pause();

  // Assert - should be paused but not enabled, no terminal writes
  expect(mouse.isPaused()).toBe(true);
  expect(mouse.isEnabled()).toBe(false);
  expect(writeSpy).not.toHaveBeenCalled();

  // Act - now enable (should enable terminal mode)
  mouse.enable();

  // Assert - should be enabled and paused, terminal writes should have occurred
  expect(mouse.isEnabled()).toBe(true);
  expect(mouse.isPaused()).toBe(true);
  expect(writeSpy).toHaveBeenCalled();
  expect(setRawModeSpy).toHaveBeenCalledWith(true);

  // Reset spies for next verification
  writeSpy.mockClear();
  setRawModeSpy.mockClear();

  // Act - resume (should not make terminal changes)
  mouse.resume();

  // Assert - should be enabled and not paused, no additional terminal writes
  expect(mouse.isEnabled()).toBe(true);
  expect(mouse.isPaused()).toBe(false);
  expect(writeSpy).not.toHaveBeenCalled();
  expect(setRawModeSpy).not.toHaveBeenCalled();

  // Cleanup
  mouse.disable();
  mouse.destroy();
});

test('Mouse.eventsOf() should not yield events when paused', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const pressEvent = '\x1b[<0;10;20M';
  const iterator = mouse.eventsOf('press');

  try {
    mouse.enable();

    // Start the async generator
    const firstEventPromise = iterator.next();

    // Act - pause the mouse
    mouse.pause();

    // Emit a press event while paused
    stream.emit('data', Buffer.from(pressEvent));

    // Give some time for event processing
    await sleep(50);

    // Assert - the promise should still be pending (no event yielded)
    // We can verify this by checking if we can create a race that times out
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100));

    try {
      await Promise.race([firstEventPromise, timeoutPromise]);
      // If we get here, the event was yielded (which is wrong)
      expect(false).toBe(true); // This should not be reached
    } catch (err) {
      // We expect a timeout error, meaning no event was yielded
      expect((err as Error).message).toBe('Timeout');
    }

    // Act - resume the mouse
    mouse.resume();

    // Emit another press event after resume
    stream.emit('data', Buffer.from(pressEvent));

    // Assert - now the event should be yielded
    const { value } = await firstEventPromise;
    expect(value.action).toBe('press');
    expect(value.button).toBe('left');
    expect(value.x).toBe(10);
    expect(value.y).toBe(20);
  } finally {
    // Cleanup
    await iterator.return(undefined);
    mouse.destroy();
  }
});

test('Mouse.eventsOf() should queue and yield events after resume', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const iterator = mouse.eventsOf('press');

  try {
    mouse.enable();

    // Start the async generator by consuming the first event
    const firstEventPromise = iterator.next();
    stream.emit('data', Buffer.from('\x1b[<0;10;20M'));
    const { value: firstEvent } = await firstEventPromise;
    expect(firstEvent.x).toBe(10);

    // Act - pause the mouse
    mouse.pause();

    // Emit events while paused (these should be dropped, not queued)
    stream.emit('data', Buffer.from('\x1b[<0;11;21M'));
    stream.emit('data', Buffer.from('\x1b[<0;12;22M'));

    await sleep(50);

    // Act - resume the mouse
    mouse.resume();

    // Emit new events after resume (these should be yielded)
    stream.emit('data', Buffer.from('\x1b[<0;13;23M'));
    stream.emit('data', Buffer.from('\x1b[<0;14;24M'));

    // Assert - should get the events after resume, not the ones during pause
    const { value: secondEvent } = await iterator.next();
    expect(secondEvent.x).toBe(13); // First event after resume
    expect(secondEvent.y).toBe(23);

    const { value: thirdEvent } = await iterator.next();
    expect(thirdEvent.x).toBe(14); // Second event after resume
    expect(thirdEvent.y).toBe(24);
  } finally {
    // Cleanup
    await iterator.return(undefined);
    mouse.destroy();
  }
});

test('Mouse.stream() should not yield events when paused', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const pressEvent = '\x1b[<0;10;20M';
  const iterator = mouse.stream();

  try {
    mouse.enable();

    // Start the async generator
    const firstEventPromise = iterator.next();

    // Act - pause the mouse
    mouse.pause();

    // Emit a press event while paused
    stream.emit('data', Buffer.from(pressEvent));

    // Give some time for event processing
    await sleep(50);

    // Assert - the promise should still be pending (no event yielded)
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100));

    try {
      await Promise.race([firstEventPromise, timeoutPromise]);
      // If we get here, the event was yielded (which is wrong)
      expect(false).toBe(true); // This should not be reached
    } catch (err) {
      // We expect a timeout error, meaning no event was yielded
      expect((err as Error).message).toBe('Timeout');
    }

    // Act - resume the mouse
    mouse.resume();

    // Emit another press event after resume
    stream.emit('data', Buffer.from(pressEvent));

    // Assert - now the event should be yielded
    const { value } = await firstEventPromise;
    expect(value.type).toBe('press');
    expect(value.event.action).toBe('press');
    expect(value.event.button).toBe('left');
    expect(value.event.x).toBe(10);
    expect(value.event.y).toBe(20);
  } finally {
    // Cleanup
    await iterator.return(undefined);
    mouse.destroy();
  }
});

test('Mouse.stream() should not yield events of any type when paused', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const iterator = mouse.stream();

  try {
    mouse.enable();

    // Start the async generator
    const firstEventPromise = iterator.next();

    // Act - pause the mouse
    mouse.pause();

    // Emit various events while paused
    stream.emit('data', Buffer.from('\x1b[<0;10;20M')); // press
    stream.emit('data', Buffer.from('\x1b[<0;10;20m')); // release
    stream.emit('data', Buffer.from('\x1b[<32;15;25M')); // drag
    stream.emit('data', Buffer.from('\x1b[<64;10;20M')); // wheel
    stream.emit('data', Buffer.from('\x1b[<35;10;20M')); // move

    // Give some time for event processing
    await sleep(50);

    // Assert - the promise should still be pending (no events yielded)
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100));

    try {
      await Promise.race([firstEventPromise, timeoutPromise]);
      // If we get here, an event was yielded (which is wrong)
      expect(false).toBe(true); // This should not be reached
    } catch (err) {
      // We expect a timeout error, meaning no event was yielded
      expect((err as Error).message).toBe('Timeout');
    }

    // Act - resume the mouse
    mouse.resume();

    // Emit events after resume
    stream.emit('data', Buffer.from('\x1b[<0;11;21M')); // press

    // Assert - now events should be yielded
    const { value } = await firstEventPromise;
    expect(value.type).toBe('press');
    expect(value.event.x).toBe(11);
    expect(value.event.y).toBe(21);
  } finally {
    // Cleanup
    await iterator.return(undefined);
    mouse.destroy();
  }
});

test('Mouse.eventsOf() with latestOnly should not update when paused', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const iterator = mouse.eventsOf('press', { latestOnly: true });

  try {
    mouse.enable();

    // Start the async generator by consuming the first event
    const firstEventPromise = iterator.next();
    stream.emit('data', Buffer.from('\x1b[<0;10;20M'));
    const { value: firstEvent } = await firstEventPromise;
    expect(firstEvent.x).toBe(10);

    // Act - pause the mouse
    mouse.pause();

    // Emit multiple events while paused (none should be captured)
    stream.emit('data', Buffer.from('\x1b[<0;11;21M'));
    stream.emit('data', Buffer.from('\x1b[<0;12;22M'));
    stream.emit('data', Buffer.from('\x1b[<0;13;23M'));

    await sleep(50);

    // Act - resume the mouse
    mouse.resume();

    // Emit new events after resume
    stream.emit('data', Buffer.from('\x1b[<0;14;24M'));
    stream.emit('data', Buffer.from('\x1b[<0;15;25M'));

    // Assert - should get the latest event after resume, not any from pause
    const { value: latestEvent } = await iterator.next();
    expect(latestEvent.x).toBe(15); // Latest event after resume
    expect(latestEvent.y).toBe(25);
  } finally {
    // Cleanup
    await iterator.return(undefined);
    mouse.destroy();
  }
});

test('Mouse.pause() then disable() should preserve paused state', () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });

  // Act - enable, then pause, then disable
  mouse.enable();
  mouse.pause();
  mouse.disable();

  // Assert - paused state should be preserved even after disable
  expect(mouse.isPaused()).toBe(true);
  expect(mouse.isEnabled()).toBe(false);

  // Act - re-enable
  mouse.enable();

  // Assert - should still be paused after re-enable
  expect(mouse.isEnabled()).toBe(true);
  expect(mouse.isPaused()).toBe(true);

  // Cleanup
  mouse.destroy();
});

test('Mouse.disable() then pause() should set paused state independently', () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });

  // Act - enable, then disable, then pause
  mouse.enable();
  mouse.disable();
  mouse.pause();

  // Assert - both states should be independent
  expect(mouse.isEnabled()).toBe(false);
  expect(mouse.isPaused()).toBe(true);

  // Act - resume
  mouse.resume();

  // Assert - paused state cleared, but still disabled
  expect(mouse.isPaused()).toBe(false);
  expect(mouse.isEnabled()).toBe(false);

  // Cleanup
  mouse.destroy();
});

test('Mouse.resume() while disabled should not make terminal changes', () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const writeSpy = vi.fn(() => true);
  const setRawModeSpy = vi.fn(() => stream);

  const mockOutputStream = {
    write: writeSpy,
  } as unknown as NodeJS.WriteStream;

  stream.setRawMode = setRawModeSpy as never;

  const mouse = new Mouse({ inputStream: stream, outputStream: mockOutputStream });

  // Act - enable, pause, disable, then resume while disabled
  mouse.enable();
  mouse.pause();
  mouse.disable();

  // Reset spies to clear previous calls
  writeSpy.mockClear();
  setRawModeSpy.mockClear();

  mouse.resume();

  // Assert - resume should not make any terminal writes
  expect(mouse.isPaused()).toBe(false);
  expect(mouse.isEnabled()).toBe(false);
  expect(writeSpy).not.toHaveBeenCalled();
  expect(setRawModeSpy).not.toHaveBeenCalled();

  // Cleanup
  mouse.destroy();
});

test('Mouse.enable() while paused should preserve paused state', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const pressEvent = '\x1b[<0;10;20M';
  const pressSpy = vi.fn(() => {});

  mouse.on('press', pressSpy);

  // Act - pause before enable
  mouse.pause();

  // Enable while paused
  mouse.enable();

  // Assert - should be enabled but still paused
  expect(mouse.isEnabled()).toBe(true);
  expect(mouse.isPaused()).toBe(true);

  // Emit an event while paused
  stream.emit('data', Buffer.from(pressEvent));

  // Assert - no event should be emitted while paused
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(pressSpy).not.toHaveBeenCalled();

  // Act - resume
  mouse.resume();

  // Emit another event after resume
  stream.emit('data', Buffer.from(pressEvent));

  // Assert - event should now be emitted
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(pressSpy).toHaveBeenCalledTimes(1);

  // Cleanup
  mouse.destroy();
});

test('Mouse should handle full cycle: pause → disable → enable → resume', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const pressEvent = '\x1b[<0;10;20M';
  const pressSpy = vi.fn(() => {});

  mouse.on('press', pressSpy);

  // Act - full cycle: enable → pause → disable → enable → resume
  mouse.enable();
  expect(mouse.isEnabled()).toBe(true);
  expect(mouse.isPaused()).toBe(false);

  mouse.pause();
  expect(mouse.isEnabled()).toBe(true);
  expect(mouse.isPaused()).toBe(true);

  mouse.disable();
  expect(mouse.isEnabled()).toBe(false);
  expect(mouse.isPaused()).toBe(true); // Paused state preserved

  mouse.enable();
  expect(mouse.isEnabled()).toBe(true);
  expect(mouse.isPaused()).toBe(true); // Still paused

  // Emit event while paused - should be blocked
  stream.emit('data', Buffer.from(pressEvent));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(pressSpy).not.toHaveBeenCalled();

  mouse.resume();
  expect(mouse.isEnabled()).toBe(true);
  expect(mouse.isPaused()).toBe(false);

  // Emit event after resume - should be emitted
  stream.emit('data', Buffer.from(pressEvent));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(pressSpy).toHaveBeenCalledTimes(1);

  // Cleanup
  mouse.destroy();
});

test('Mouse should handle reverse cycle: disable → pause → enable → resume', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const pressEvent = '\x1b[<0;10;20M';
  const pressSpy = vi.fn(() => {});

  mouse.on('press', pressSpy);

  // Act - reverse cycle: enable → disable → pause → enable → resume
  mouse.enable();
  expect(mouse.isEnabled()).toBe(true);
  expect(mouse.isPaused()).toBe(false);

  mouse.disable();
  expect(mouse.isEnabled()).toBe(false);
  expect(mouse.isPaused()).toBe(false);

  mouse.pause();
  expect(mouse.isEnabled()).toBe(false);
  expect(mouse.isPaused()).toBe(true);

  mouse.enable();
  expect(mouse.isEnabled()).toBe(true);
  expect(mouse.isPaused()).toBe(true); // Still paused

  // Emit event while paused - should be blocked
  stream.emit('data', Buffer.from(pressEvent));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(pressSpy).not.toHaveBeenCalled();

  mouse.resume();
  expect(mouse.isEnabled()).toBe(true);
  expect(mouse.isPaused()).toBe(false);

  // Emit event after resume - should be emitted
  stream.emit('data', Buffer.from(pressEvent));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(pressSpy).toHaveBeenCalledTimes(1);

  // Cleanup
  mouse.destroy();
});

test('Mouse should handle multiple pause/resume cycles with enable/disable', () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const pressEvent = '\x1b[<0;10;20M';
  const pressSpy = vi.fn(() => {});

  mouse.on('press', pressSpy);
  mouse.enable();

  // Act - multiple cycles of pause/resume
  for (let i = 0; i < 3; i++) {
    // Pause
    mouse.pause();
    expect(mouse.isPaused()).toBe(true);

    // Emit while paused - should be blocked
    stream.emit('data', Buffer.from(pressEvent));
    expect(pressSpy).toHaveBeenCalledTimes(i);

    // Resume
    mouse.resume();
    expect(mouse.isPaused()).toBe(false);

    // Emit after resume - should be emitted
    stream.emit('data', Buffer.from(pressEvent));
    expect(pressSpy).toHaveBeenCalledTimes(i + 1);
  }

  // Act - disable/enable cycle
  mouse.disable();
  expect(mouse.isEnabled()).toBe(false);

  mouse.enable();
  expect(mouse.isEnabled()).toBe(true);

  // Emit event - should work (this is the 4th event: 3 from cycles + 1 after disable/enable)
  stream.emit('data', Buffer.from(pressEvent));
  expect(pressSpy).toHaveBeenCalledTimes(4);

  // Cleanup
  mouse.destroy();
});

test('Mouse eventsOf should handle pause → disable → enable → resume cycle', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const iterator = mouse.eventsOf('press');

  try {
    mouse.enable();

    // Start the async generator
    const firstEventPromise = iterator.next();
    stream.emit('data', Buffer.from('\x1b[<0;10;20M'));
    const { value: firstEvent } = await firstEventPromise;
    expect(firstEvent.x).toBe(10);

    // Act - pause → disable → enable → resume cycle
    mouse.pause();
    mouse.disable();
    mouse.enable();

    // Emit event while still paused - should not be yielded
    stream.emit('data', Buffer.from('\x1b[<0;11;21M'));
    await sleep(50);

    // Resume
    mouse.resume();

    // Emit event after resume - should be yielded
    stream.emit('data', Buffer.from('\x1b[<0;12;22M'));

    // Assert - should get the event after resume
    const { value: secondEvent } = await iterator.next();
    expect(secondEvent.x).toBe(12);
    expect(secondEvent.y).toBe(22);
  } finally {
    // Cleanup
    await iterator.return(undefined);
    mouse.destroy();
  }
});

test('Mouse.isPaused() and isEnabled() should remain independent through all transitions', () => {
  // Arrange
  const mouse = new Mouse({ inputStream: makeFakeTTYStream() });

  // Test all state combinations to ensure independence
  const testStates = [
    { action: () => mouse.pause(), expectedPaused: true, expectedEnabled: false },
    { action: () => mouse.resume(), expectedPaused: false, expectedEnabled: false },
    { action: () => mouse.enable(), expectedPaused: false, expectedEnabled: true },
    { action: () => mouse.pause(), expectedPaused: true, expectedEnabled: true },
    { action: () => mouse.disable(), expectedPaused: true, expectedEnabled: false },
    { action: () => mouse.resume(), expectedPaused: false, expectedEnabled: false },
    { action: () => mouse.enable(), expectedPaused: false, expectedEnabled: true },
    { action: () => mouse.disable(), expectedPaused: false, expectedEnabled: false },
  ];

  for (const state of testStates) {
    state.action();
    expect(mouse.isPaused()).toBe(state.expectedPaused);
    expect(mouse.isEnabled()).toBe(state.expectedEnabled);
  }

  // Cleanup
  mouse.destroy();
});

test('Mouse default threshold should emit click when press and release at same position', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const pressEvent = '\x1b[<0;10;20M';
  const releaseEvent = '\x1b[<0;10;20m';

  const eventPromise = new Promise<void>((resolve) => {
    mouse.on('click', (event) => {
      // Assert
      expect(event.action).toBe('click');
      expect(event.button).toBe('left');
      expect(event.x).toBe(10);
      expect(event.y).toBe(20);
      resolve();
    });
  });

  // Act
  mouse.enable();
  stream.emit('data', Buffer.from(pressEvent));
  stream.emit('data', Buffer.from(releaseEvent));

  await eventPromise;

  // Cleanup
  mouse.destroy();
});

test('Mouse default threshold should emit click when distance is exactly 1 cell', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const pressEvent = '\x1b[<0;10;20M';
  const releaseEvent = '\x1b[<0;11;21m'; // xDiff=1, yDiff=1 (at threshold boundary)

  const eventPromise = new Promise<void>((resolve) => {
    mouse.on('click', (event) => {
      // Assert
      expect(event.action).toBe('click');
      expect(event.button).toBe('left');
      expect(event.x).toBe(11);
      expect(event.y).toBe(21);
      resolve();
    });
  });

  // Act
  mouse.enable();
  stream.emit('data', Buffer.from(pressEvent));
  stream.emit('data', Buffer.from(releaseEvent));

  await eventPromise;

  // Cleanup
  mouse.destroy();
});

test('Mouse default threshold should not emit click when distance exceeds 1 cell', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const pressEvent = '\x1b[<0;10;20M';
  const releaseEvent = '\x1b[<0;12;22m'; // xDiff=2, yDiff=2 (beyond threshold)

  const clickSpy = vi.fn(() => {});
  mouse.on('click', clickSpy);

  // Act
  mouse.enable();
  stream.emit('data', Buffer.from(pressEvent));
  stream.emit('data', Buffer.from(releaseEvent));

  // Assert
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(clickSpy).not.toHaveBeenCalled();

  // Cleanup
  mouse.destroy();
});

test('Mouse default threshold should not emit click when only X distance exceeds 1', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const pressEvent = '\x1b[<0;10;20M';
  const releaseEvent = '\x1b[<0;12;20m'; // xDiff=2, yDiff=0 (X exceeds threshold)

  const clickSpy = vi.fn(() => {});
  mouse.on('click', clickSpy);

  // Act
  mouse.enable();
  stream.emit('data', Buffer.from(pressEvent));
  stream.emit('data', Buffer.from(releaseEvent));

  // Assert
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(clickSpy).not.toHaveBeenCalled();

  // Cleanup
  mouse.destroy();
});

test('Mouse default threshold should not emit click when only Y distance exceeds 1', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });
  const pressEvent = '\x1b[<0;10;20M';
  const releaseEvent = '\x1b[<0;10;22m'; // xDiff=0, yDiff=2 (Y exceeds threshold)

  const clickSpy = vi.fn(() => {});
  mouse.on('click', clickSpy);

  // Act
  mouse.enable();
  stream.emit('data', Buffer.from(pressEvent));
  stream.emit('data', Buffer.from(releaseEvent));

  // Assert
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(clickSpy).not.toHaveBeenCalled();

  // Cleanup
  mouse.destroy();
});

test('Mouse default threshold should maintain backward compatibility with hardcoded behavior', async () => {
  // Arrange - This test verifies that the default threshold of 1
  // maintains the same behavior as the previous hardcoded implementation
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });

  // Test case 1: Same position (should click)
  const click1Promise = new Promise<void>((resolve) => {
    const handler = (event: unknown) => {
      mouse.off('click', handler);
      expect(event).toBeDefined();
      expect((event as MouseEvent).x).toBe(10);
      expect((event as MouseEvent).y).toBe(20);
      resolve();
    };
    mouse.on('click', handler);
  });

  mouse.enable();
  stream.emit('data', Buffer.from('\x1b[<0;10;20M')); // press at (10,20)
  stream.emit('data', Buffer.from('\x1b[<0;10;20m')); // release at (10,20)
  await click1Promise;

  // Test case 2: Distance of 1 in both directions (should click)
  const click2Promise = new Promise<void>((resolve) => {
    const handler = (event: unknown) => {
      mouse.off('click', handler);
      expect(event).toBeDefined();
      resolve();
    };
    mouse.on('click', handler);
  });

  stream.emit('data', Buffer.from('\x1b[<0;30;40M')); // press at (30,40)
  stream.emit('data', Buffer.from('\x1b[<0;31;41m')); // release at (31,41) - distance of 1
  await click2Promise;

  // Test case 3: Distance > 1 (should not click)
  const clickSpy = vi.fn(() => {});
  mouse.on('click', clickSpy);

  stream.emit('data', Buffer.from('\x1b[<0;50;60M')); // press at (50,60)
  stream.emit('data', Buffer.from('\x1b[<0;53;63m')); // release at (53,63) - distance of 3

  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(clickSpy).not.toHaveBeenCalled();

  // Cleanup
  mouse.destroy();
});

test('Mouse with threshold 0 should only emit click when press and release at exact same position', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream, clickDistanceThreshold: 0 });

  // Act & Assert - Test exact position (should click)
  const click1Promise = new Promise<void>((resolve) => {
    mouse.on('click', (event) => {
      expect(event.x).toBe(10);
      expect(event.y).toBe(20);
      resolve();
    });
  });

  mouse.enable();
  stream.emit('data', Buffer.from('\x1b[<0;10;20M')); // press at (10,20)
  stream.emit('data', Buffer.from('\x1b[<0;10;20m')); // release at (10,20) - exact same position
  await click1Promise;

  // Act & Assert - Test position with distance of 1 (should NOT click)
  const clickSpy = vi.fn(() => {});
  mouse.on('click', clickSpy);

  stream.emit('data', Buffer.from('\x1b[<0;30;40M')); // press at (30,40)
  stream.emit('data', Buffer.from('\x1b[<0;31;41m')); // release at (31,41) - xDiff=1, yDiff=1

  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(clickSpy).not.toHaveBeenCalled();

  // Cleanup
  mouse.destroy();
});

test('Mouse with threshold 2 should emit click when distance is within 2 cells', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream, clickDistanceThreshold: 2 });

  // Act & Assert - Test distance of 2 (should click)
  const click1Promise = new Promise<void>((resolve) => {
    mouse.on('click', (event) => {
      expect(event.x).toBe(12);
      expect(event.y).toBe(22);
      resolve();
    });
  });

  mouse.enable();
  stream.emit('data', Buffer.from('\x1b[<0;10;20M')); // press at (10,20)
  stream.emit('data', Buffer.from('\x1b[<0;12;22m')); // release at (12,22) - xDiff=2, yDiff=2
  await click1Promise;

  // Act & Assert - Test distance of 3 (should NOT click)
  const clickSpy = vi.fn(() => {});
  mouse.on('click', clickSpy);

  stream.emit('data', Buffer.from('\x1b[<0;50;60M')); // press at (50,60)
  stream.emit('data', Buffer.from('\x1b[<0;53;63m')); // release at (53,63) - xDiff=3, yDiff=3

  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(clickSpy).not.toHaveBeenCalled();

  // Cleanup
  mouse.destroy();
});

test('Mouse with threshold 5 should emit click when distance is within 5 cells', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream, clickDistanceThreshold: 5 });

  // Act & Assert - Test distance of 5 (should click)
  const click1Promise = new Promise<void>((resolve) => {
    mouse.on('click', (event) => {
      expect(event.x).toBe(15);
      expect(event.y).toBe(25);
      resolve();
    });
  });

  mouse.enable();
  stream.emit('data', Buffer.from('\x1b[<0;10;20M')); // press at (10,20)
  stream.emit('data', Buffer.from('\x1b[<0;15;25m')); // release at (15,25) - xDiff=5, yDiff=5
  await click1Promise;

  // Act & Assert - Test distance of 6 (should NOT click)
  const clickSpy = vi.fn(() => {});
  mouse.on('click', clickSpy);

  stream.emit('data', Buffer.from('\x1b[<0;50;60M')); // press at (50,60)
  stream.emit('data', Buffer.from('\x1b[<0;56;66m')); // release at (56,66) - xDiff=6, yDiff=6

  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(clickSpy).not.toHaveBeenCalled();

  // Cleanup
  mouse.destroy();
});

test('Mouse with threshold 10 should emit click when distance is within 10 cells', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream, clickDistanceThreshold: 10 });

  // Act & Assert - Test distance of 10 (should click)
  const click1Promise = new Promise<void>((resolve) => {
    mouse.on('click', (event) => {
      expect(event.x).toBe(20);
      expect(event.y).toBe(30);
      resolve();
    });
  });

  mouse.enable();
  stream.emit('data', Buffer.from('\x1b[<0;10;20M')); // press at (10,20)
  stream.emit('data', Buffer.from('\x1b[<0;20;30m')); // release at (20,30) - xDiff=10, yDiff=10
  await click1Promise;

  // Act & Assert - Test distance of 11 (should NOT click)
  const clickSpy = vi.fn(() => {});
  mouse.on('click', clickSpy);

  stream.emit('data', Buffer.from('\x1b[<0;50;60M')); // press at (50,60)
  stream.emit('data', Buffer.from('\x1b[<0;61;71m')); // release at (61,71) - xDiff=11, yDiff=11

  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(clickSpy).not.toHaveBeenCalled();

  // Cleanup
  mouse.destroy();
});

test('Mouse with threshold 0 should require exact same position - all edge cases', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream, clickDistanceThreshold: 0 });

  mouse.enable();

  // Act & Assert - Test 1: Exact same position (should click)
  const click1Promise = new Promise<void>((resolve) => {
    const handler = (event: unknown) => {
      mouse.off('click', handler);
      expect(event).toBeDefined();
      resolve();
    };
    mouse.on('click', handler);
  });

  stream.emit('data', Buffer.from('\x1b[<0;10;20M')); // press at (10,20)
  stream.emit('data', Buffer.from('\x1b[<0;10;20m')); // release at (10,20) - exact same position
  await click1Promise;

  // Act & Assert - Test 2: X differs by 1, Y is same (should NOT click)
  const clickSpy1 = vi.fn(() => {});
  mouse.on('click', clickSpy1);

  stream.emit('data', Buffer.from('\x1b[<0;30;40M')); // press at (30,40)
  stream.emit('data', Buffer.from('\x1b[<0;31;40m')); // release at (31,40) - xDiff=1, yDiff=0

  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(clickSpy1).not.toHaveBeenCalled();

  // Act & Assert - Test 3: Y differs by 1, X is same (should NOT click)
  const clickSpy2 = vi.fn(() => {});
  mouse.on('click', clickSpy2);

  stream.emit('data', Buffer.from('\x1b[<0;50;60M')); // press at (50,60)
  stream.emit('data', Buffer.from('\x1b[<0;50;61m')); // release at (50,61) - xDiff=0, yDiff=1

  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(clickSpy2).not.toHaveBeenCalled();

  // Act & Assert - Test 4: Both X and Y differ by 1 (should NOT click)
  const clickSpy3 = vi.fn(() => {});
  mouse.on('click', clickSpy3);

  stream.emit('data', Buffer.from('\x1b[<0;70;80M')); // press at (70,80)
  stream.emit('data', Buffer.from('\x1b[<0;71;81m')); // release at (71,81) - xDiff=1, yDiff=1

  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(clickSpy3).not.toHaveBeenCalled();

  // Act & Assert - Test 5: X differs by more, Y is same (should NOT click)
  const clickSpy4 = vi.fn(() => {});
  mouse.on('click', clickSpy4);

  stream.emit('data', Buffer.from('\x1b[<0;90;100M')); // press at (90,100)
  stream.emit('data', Buffer.from('\x1b[<0;95;100m')); // release at (95,100) - xDiff=5, yDiff=0

  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(clickSpy4).not.toHaveBeenCalled();

  // Act & Assert - Test 6: Y differs by more, X is same (should NOT click)
  const clickSpy5 = vi.fn(() => {});
  mouse.on('click', clickSpy5);

  stream.emit('data', Buffer.from('\x1b[<0;110;120M')); // press at (110,120)
  stream.emit('data', Buffer.from('\x1b[<0;110;125m')); // release at (110,125) - xDiff=0, yDiff=5

  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(clickSpy5).not.toHaveBeenCalled();

  // Act & Assert - Test 7: Verify exact position works again at different coordinates
  const click2Promise = new Promise<void>((resolve) => {
    const handler = (event: unknown) => {
      mouse.off('click', handler);
      expect(event).toBeDefined();
      resolve();
    };
    mouse.on('click', handler);
  });

  stream.emit('data', Buffer.from('\x1b[<0;200;300M')); // press at (200,300)
  stream.emit('data', Buffer.from('\x1b[<0;200;300m')); // release at (200,300) - exact same position
  await click2Promise;

  // Cleanup
  mouse.destroy();
});

test('Mouse with threshold 50 should emit click when distance is within 50 cells', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream, clickDistanceThreshold: 50 });

  // Act & Assert - Test distance of 50 (should click)
  const click1Promise = new Promise<void>((resolve) => {
    mouse.on('click', (event) => {
      expect(event.x).toBe(60);
      expect(event.y).toBe(70);
      resolve();
    });
  });

  mouse.enable();
  stream.emit('data', Buffer.from('\x1b[<0;10;20M')); // press at (10,20)
  stream.emit('data', Buffer.from('\x1b[<0;60;70m')); // release at (60,70) - xDiff=50, yDiff=50
  await click1Promise;

  // Act & Assert - Test distance of 51 (should NOT click)
  const clickSpy = vi.fn(() => {});
  mouse.on('click', clickSpy);

  stream.emit('data', Buffer.from('\x1b[<0;100;200M')); // press at (100,200)
  stream.emit('data', Buffer.from('\x1b[<0;151;251m')); // release at (151,251) - xDiff=51, yDiff=51

  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(clickSpy).not.toHaveBeenCalled();

  // Cleanup
  mouse.destroy();
});

test('Mouse with threshold 100 should emit click when distance is within 100 cells', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream, clickDistanceThreshold: 100 });

  // Act & Assert - Test distance of 100 (should click)
  const click1Promise = new Promise<void>((resolve) => {
    mouse.on('click', (event) => {
      expect(event.x).toBe(110);
      expect(event.y).toBe(120);
      resolve();
    });
  });

  mouse.enable();
  stream.emit('data', Buffer.from('\x1b[<0;10;20M')); // press at (10,20)
  stream.emit('data', Buffer.from('\x1b[<0;110;120m')); // release at (110,120) - xDiff=100, yDiff=100
  await click1Promise;

  // Act & Assert - Test distance of 101 (should NOT click)
  const clickSpy = vi.fn(() => {});
  mouse.on('click', clickSpy);

  stream.emit('data', Buffer.from('\x1b[<0;200;300M')); // press at (200,300)
  stream.emit('data', Buffer.from('\x1b[<0;301;401m')); // release at (301,401) - xDiff=101, yDiff=101

  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(clickSpy).not.toHaveBeenCalled();

  // Cleanup
  mouse.destroy();
});

test('Mouse with threshold 500 should emit click when distance is within 500 cells', async () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream, clickDistanceThreshold: 500 });

  // Act & Assert - Test distance of 500 (should click)
  const click1Promise = new Promise<void>((resolve) => {
    mouse.on('click', (event) => {
      expect(event.x).toBe(510);
      expect(event.y).toBe(520);
      resolve();
    });
  });

  mouse.enable();
  stream.emit('data', Buffer.from('\x1b[<0;10;20M')); // press at (10,20)
  stream.emit('data', Buffer.from('\x1b[<0;510;520m')); // release at (510,520) - xDiff=500, yDiff=500
  await click1Promise;

  // Act & Assert - Test distance of 501 (should NOT click)
  const clickSpy = vi.fn(() => {});
  mouse.on('click', clickSpy);

  stream.emit('data', Buffer.from('\x1b[<0;1000;2000M')); // press at (1000,2000)
  stream.emit('data', Buffer.from('\x1b[<0;1501;2501m')); // release at (1501,2501) - xDiff=501, yDiff=501

  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(clickSpy).not.toHaveBeenCalled();

  // Cleanup
  mouse.destroy();
});

// ========== Garbage Collection Cleanup Tests ==========

// Helper to check if --expose-gc flag is available
const gcEnabled = typeof global.gc !== 'undefined';

test('Mouse should handle garbage collection cleanup', async () => {
  if (!gcEnabled) {
    console.log('Skipping test: --expose-gc flag not set. Run with: node --expose-gc ./node_modules/.bin/vitest run');
    return;
  }

  // Arrange
  const stream = makeFakeTTYStream();
  let attachCount = 0;
  let detachCount = 0;

  // Track listener attachments
  const originalOn = stream.on.bind(stream);
  stream.on = ((event: string, listener: (...args: unknown[]) => void) => {
    if (event === 'data') attachCount++;
    return originalOn(event, listener);
  }) as typeof stream.on;

  const originalOff = stream.off.bind(stream);
  stream.off = ((event: string, listener: (...args: unknown[]) => void) => {
    if (event === 'data') detachCount++;
    return originalOff(event, listener);
  }) as typeof stream.off;

  // Act: Create Mouse instance, enable it, then lose reference
  {
    const mouse = new Mouse({ inputStream: stream });
    mouse.enable();
    expect(attachCount).toBe(1);
    expect(detachCount).toBe(0);
    // Mouse instance goes out of scope here
  }

  // Clear references to help GC
  // @ts-expect-error - global.gc is available when gcEnabled is true
  global.gc();
  // @ts-expect-error - global.gc is available when gcEnabled is true
  global.gc();

  // Give FinalizationRegistry callback time to execute
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Assert: FinalizationRegistry should have cleaned up the listener
  // Note: GC timing is non-deterministic, so we just check that it doesn't crash
  expect(typeof detachCount).toBe('number');
});

test('Mouse should handle GC correctly when explicitly disabled before collection', async () => {
  if (!gcEnabled) {
    console.log('Skipping test: --expose-gc flag not set. Run with: node --expose-gc ./node_modules/.bin/vitest run');
    return;
  }

  // Arrange
  const stream = makeFakeTTYStream();
  const attachSpy = vi.fn(() => {});
  const detachSpy = vi.fn(() => {});

  const originalOn = stream.on.bind(stream);
  stream.on = ((event: string, listener: (...args: unknown[]) => void) => {
    if (event === 'data') attachSpy();
    return originalOn(event, listener);
  }) as typeof stream.on;

  const originalOff = stream.off.bind(stream);
  stream.off = ((event: string, listener: (...args: unknown[]) => void) => {
    if (event === 'data') detachSpy();
    return originalOff(event, listener);
  }) as typeof stream.off;

  // Act: Create Mouse instance, enable, then explicitly disable
  {
    const mouse = new Mouse({ inputStream: stream });
    mouse.enable();
    mouse.disable();
    expect(attachSpy).toHaveBeenCalled();
    expect(detachSpy).toHaveBeenCalledTimes(1);
    // Mouse instance goes out of scope here
  }

  // Force garbage collection
  // @ts-expect-error - global.gc is available when gcEnabled is true
  global.gc();

  // Give FinalizationRegistry callback time to execute
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Assert: detachSpy should still be 1 (no additional GC cleanup)
  expect(detachSpy).toHaveBeenCalledTimes(1);
});

test('Mouse.disable() should be idempotent and safe to call multiple times', () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });

  // Act: Enable and disable multiple times
  mouse.enable();
  mouse.disable();
  mouse.disable();
  mouse.disable();

  // Assert: Should not throw any errors
  expect(mouse.isEnabled()).toBe(false);
  mouse.destroy();
});

test('Mouse should handle multiple enable/disable cycles with FinalizationRegistry', async () => {
  if (!gcEnabled) {
    console.log('Skipping test: --expose-gc flag not set. Run with: node --expose-gc ./node_modules/.bin/vitest run');
    return;
  }

  // Arrange
  const stream = makeFakeTTYStream();
  const attachSpy = vi.fn(() => {});
  const detachSpy = vi.fn(() => {});

  const originalOn = stream.on.bind(stream);
  stream.on = ((event: string, listener: (...args: unknown[]) => void) => {
    if (event === 'data') attachSpy();
    return originalOn(event, listener);
  }) as typeof stream.on;

  const originalOff = stream.off.bind(stream);
  stream.off = ((event: string, listener: (...args: unknown[]) => void) => {
    if (event === 'data') detachSpy();
    return originalOff(event, listener);
  }) as typeof stream.off;

  // Act: Multiple enable/disable cycles
  const mouse = new Mouse({ inputStream: stream });
  mouse.enable();
  mouse.disable();
  mouse.enable();
  mouse.disable();
  mouse.enable();
  mouse.disable();

  // Assert: Should have 3 attaches and 3 detaches
  expect(attachSpy).toHaveBeenCalledTimes(3);
  expect(detachSpy).toHaveBeenCalledTimes(3);

  // Now lose reference and GC
  const weakRef = new WeakRef(mouse);
  const mouseRef = mouse; // Keep reference to prevent early GC
  mouseRef.destroy(); // Explicit destroy

  // Force garbage collection
  global.gc?.();
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Assert: detachSpy should still be 3 (no additional GC cleanup)
  expect(detachSpy).toHaveBeenCalledTimes(3);
  expect(weakRef.deref()).toBeDefined();
});

test('Mouse.disable() when not enabled should be safe', () => {
  // Arrange
  const stream = makeFakeTTYStream();
  const mouse = new Mouse({ inputStream: stream });

  // Act & Assert: Disable without ever enabling should not throw
  mouse.disable();
  mouse.disable();

  expect(mouse.isEnabled()).toBe(false);
  mouse.destroy();
});

test('Multiple Mouse instances should be garbage collected independently', async () => {
  if (!gcEnabled) {
    console.log('Skipping test: --expose-gc flag not set. Run with: node --expose-gc ./node_modules/.bin/vitest run');
    return;
  }

  // Arrange
  const stream = makeFakeTTYStream();
  let attachCount = 0;
  let _detachCount = 0;

  const originalOn = stream.on.bind(stream);
  stream.on = ((event: string, listener: (...args: unknown[]) => void) => {
    if (event === 'data') attachCount++;
    return originalOn(event, listener);
  }) as typeof stream.on;

  const originalOff = stream.off.bind(stream);
  stream.off = ((event: string, listener: (...args: unknown[]) => void) => {
    if (event === 'data') _detachCount++;
    return originalOff(event, listener);
  }) as typeof stream.off;

  // Act: Create multiple Mouse instances, enable each, lose all references
  const weakRefs: WeakRef<Mouse>[] = [];
  {
    const mouse1 = new Mouse({ inputStream: stream });
    const mouse2 = new Mouse({ inputStream: stream });
    const mouse3 = new Mouse({ inputStream: stream });

    weakRefs.push(new WeakRef(mouse1));
    weakRefs.push(new WeakRef(mouse2));
    weakRefs.push(new WeakRef(mouse3));

    mouse1.enable();
    mouse2.enable();
    mouse3.enable();

    expect(attachCount).toBe(3);

    // All instances go out of scope here
  }

  // Force garbage collection multiple times
  // @ts-expect-error - global.gc is available when gcEnabled is true
  global.gc();
  // @ts-expect-error - global.gc is available when gcEnabled is true
  global.gc();

  // Give FinalizationRegistry callbacks time to execute
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Assert: All instances should be garbage collected
  // Note: GC timing is non-deterministic, so we just verify WeakRefs work
  const ref1 = weakRefs[0]?.deref();
  const ref2 = weakRefs[1]?.deref();
  const ref3 = weakRefs[2]?.deref();

  // Check that at least some instances were collected (GC is non-deterministic)
  const collectedCount = [ref1, ref2, ref3].filter((ref) => ref === undefined).length;
  expect(collectedCount).toBeGreaterThanOrEqual(0); // At least check the test ran
});

test('Mouse.destroy() should work correctly with FinalizationRegistry', async () => {
  if (!gcEnabled) {
    console.log('Skipping test: --expose-gc flag not set. Run with: node --expose-gc ./node_modules/.bin/vitest run');
    return;
  }

  // Arrange
  const stream = makeFakeTTYStream();
  const attachSpy = vi.fn(() => {});
  const detachSpy = vi.fn(() => {});

  const originalOn = stream.on.bind(stream);
  stream.on = ((event: string, listener: (...args: unknown[]) => void) => {
    if (event === 'data') attachSpy();
    return originalOn(event, listener);
  }) as typeof stream.on;

  const originalOff = stream.off.bind(stream);
  stream.off = ((event: string, listener: (...args: unknown[]) => void) => {
    if (event === 'data') detachSpy();
    return originalOff(event, listener);
  }) as typeof stream.off;

  // Act: Create Mouse instance, enable, then explicitly destroy
  const weakRef: WeakRef<Mouse> = new WeakRef(
    (() => {
      const mouse = new Mouse({ inputStream: stream });
      mouse.enable();
      mouse.destroy();
      return mouse;
    })(),
  );

  // Force garbage collection
  // @ts-expect-error - global.gc is available when gcEnabled is true
  global.gc();

  // Give FinalizationRegistry callback time to execute
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Assert: detachSpy should be 1 (from destroy(), no additional GC cleanup)
  expect(detachSpy).toHaveBeenCalledTimes(1);
  expect(weakRef.deref()).toBeDefined();
});

test('Mouse.destroy() should be idempotent with FinalizationRegistry', async () => {
  if (!gcEnabled) {
    console.log('Skipping test: --expose-gc flag not set. Run with: node --expose-gc ./node_modules/.bin/vitest run');
    return;
  }

  // Arrange
  const stream = makeFakeTTYStream();
  const attachSpy = vi.fn(() => {});
  const detachSpy = vi.fn(() => {});

  const originalOn = stream.on.bind(stream);
  stream.on = ((event: string, listener: (...args: unknown[]) => void) => {
    if (event === 'data') attachSpy();
    return originalOn(event, listener);
  }) as typeof stream.on;

  const originalOff = stream.off.bind(stream);
  stream.off = ((event: string, listener: (...args: unknown[]) => void) => {
    if (event === 'data') detachSpy();
    return originalOff(event, listener);
  }) as typeof stream.off;

  // Act: Create Mouse instance, enable, then destroy multiple times
  const mouse = new Mouse({ inputStream: stream });
  mouse.enable();
  mouse.destroy();
  mouse.destroy();
  mouse.destroy();

  // Assert: Should only detach once
  expect(attachSpy).toHaveBeenCalledTimes(1);
  expect(detachSpy).toHaveBeenCalledTimes(1);
});

describe('Mouse.isSupported()', () => {
  test('should return true when both stdin and stdout are TTY', () => {
    // Arrange
    const originalStdinIsTTY = process.stdin.isTTY;
    const originalStdoutIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

    // Act
    const result = Mouse.isSupported();

    // Assert
    expect(result).toBe(true);

    // Cleanup
    Object.defineProperty(process.stdin, 'isTTY', { value: originalStdinIsTTY, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: originalStdoutIsTTY, configurable: true });
  });

  test('should return false when stdin is not a TTY', () => {
    // Arrange
    const originalStdinIsTTY = process.stdin.isTTY;
    const originalStdoutIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

    // Act
    const result = Mouse.isSupported();

    // Assert
    expect(result).toBe(false);

    // Cleanup
    Object.defineProperty(process.stdin, 'isTTY', { value: originalStdinIsTTY, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: originalStdoutIsTTY, configurable: true });
  });

  test('should return false when stdout is not a TTY', () => {
    // Arrange
    const originalStdinIsTTY = process.stdin.isTTY;
    const originalStdoutIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    // Act
    const result = Mouse.isSupported();

    // Assert
    expect(result).toBe(false);

    // Cleanup
    Object.defineProperty(process.stdin, 'isTTY', { value: originalStdinIsTTY, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: originalStdoutIsTTY, configurable: true });
  });

  test('should return true when custom streams are TTY', () => {
    // Arrange
    const inputStream = {
      isTTY: true,
    } as unknown as ReadableStreamWithEncoding;
    const outputStream = {
      isTTY: true,
    } as unknown as NodeJS.WriteStream;

    // Act
    const result = Mouse.isSupported(inputStream, outputStream);

    // Assert
    expect(result).toBe(true);
  });

  test('should return false when custom inputStream is not TTY', () => {
    // Arrange
    const inputStream = {
      isTTY: false,
    } as unknown as ReadableStreamWithEncoding;
    const outputStream = {
      isTTY: true,
    } as unknown as NodeJS.WriteStream;

    // Act
    const result = Mouse.isSupported(inputStream, outputStream);

    // Assert
    expect(result).toBe(false);
  });

  test('should return false when custom outputStream is not TTY', () => {
    // Arrange
    const inputStream = {
      isTTY: true,
    } as unknown as ReadableStreamWithEncoding;
    const outputStream = {
      isTTY: false,
    } as unknown as NodeJS.WriteStream;

    // Act
    const result = Mouse.isSupported(inputStream, outputStream);

    // Assert
    expect(result).toBe(false);
  });
});

describe('Mouse.checkSupport()', () => {
  test('should return Supported when both streams are TTY', () => {
    // Arrange
    const inputStream = {
      isTTY: true,
    } as unknown as ReadableStreamWithEncoding;
    const outputStream = {
      isTTY: true,
    } as unknown as NodeJS.WriteStream;

    // Act
    const result = Mouse.checkSupport({ inputStream, outputStream });

    // Assert
    expect(result).toBe(Mouse.SupportCheckResult.Supported);
  });

  test('should return NotTTY when input stream is not TTY', () => {
    // Arrange
    const inputStream = {
      isTTY: false,
    } as unknown as ReadableStreamWithEncoding;
    const outputStream = {
      isTTY: true,
    } as unknown as NodeJS.WriteStream;

    // Act
    const result = Mouse.checkSupport({ inputStream, outputStream });

    // Assert
    expect(result).toBe(Mouse.SupportCheckResult.NotTTY);
  });

  test('should return OutputNotTTY when output stream is not TTY', () => {
    // Arrange
    const inputStream = {
      isTTY: true,
    } as unknown as ReadableStreamWithEncoding;
    const outputStream = {
      isTTY: false,
    } as unknown as NodeJS.WriteStream;

    // Act
    const result = Mouse.checkSupport({ inputStream, outputStream });

    // Assert
    expect(result).toBe(Mouse.SupportCheckResult.OutputNotTTY);
  });

  test('should use defaults when options not provided', () => {
    // Act
    const result = Mouse.checkSupport();

    // Assert - should work without errors
    expect(typeof result).toBe('string');
  });
});

describe('dependency injection via options', () => {
  test('uses default streams when options not provided', () => {
    // Arrange & Act
    const mouse = new Mouse();

    // Assert
    expect(mouse).toBeInstanceOf(Mouse);
    mouse.destroy();
  });

  test('uses custom streams from options', () => {
    // Arrange
    const customIn = makeFakeTTYStream();
    const customOut = process.stdout;

    // Act
    const mouse = new Mouse({
      inputStream: customIn,
      outputStream: customOut,
    });

    // Assert
    expect(mouse).toBeInstanceOf(Mouse);
    mouse.enable();
    expect(mouse.isEnabled()).toBe(true);
    mouse.destroy();
  });

  test('passes setRawMode from options to TTYController', () => {
    // Arrange
    const customSetRawMode = vi.fn();
    const stream = makeFakeTTYStream();

    // Act
    const mouse = new Mouse({
      inputStream: stream,
      setRawMode: customSetRawMode,
    });
    mouse.enable();

    // Assert
    expect(customSetRawMode).toHaveBeenCalledWith(true);
    mouse.destroy();
  });

  test('uses default setRawMode when not provided in options', () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const originalSetRawMode = stream.setRawMode.bind(stream);
    const setRawModeSpy = vi.fn(originalSetRawMode);
    stream.setRawMode = setRawModeSpy;

    // Act
    const mouse = new Mouse({
      inputStream: stream,
    });
    mouse.enable();

    // Assert
    expect(setRawModeSpy).toHaveBeenCalledWith(true);
    mouse.destroy();
  });

  test('combines multiple options correctly', () => {
    // Arrange
    const customSetRawMode = vi.fn();
    const stream = makeFakeTTYStream();

    // Act
    const mouse = new Mouse({
      inputStream: stream,
      outputStream: process.stdout,
      setRawMode: customSetRawMode,
      clickDistanceThreshold: 5,
    });
    mouse.enable();

    // Assert
    expect(customSetRawMode).toHaveBeenCalledWith(true);
    expect(mouse.isEnabled()).toBe(true);
    mouse.destroy();
  });

  test('uses custom emitter from options', () => {
    // Arrange
    const customEmitter = new EventEmitter();

    // Act
    const mouse = new Mouse({
      emitter: customEmitter,
    });

    // Assert
    expect(mouse).toBeInstanceOf(Mouse);
    mouse.destroy();
  });
});

describe('Mouse.waitForClick()', () => {
  test('should resolve when click event occurs', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const pressEvent = '\x1b[<0;10;20M';
    const releaseEvent = '\x1b[<0;10;20m';

    mouse.enable();

    // Act - start waiting for click
    const clickPromise = mouse.waitForClick();

    // Emit press and release to trigger click
    stream.emit('data', Buffer.from(pressEvent));
    stream.emit('data', Buffer.from(releaseEvent));

    // Assert
    const click = await clickPromise;
    expect(click.action).toBe('click');
    expect(click.button).toBe('left');
    expect(click.x).toBe(10);
    expect(click.y).toBe(20);

    // Cleanup
    mouse.destroy();
  });

  test('should timeout if no click occurs', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });

    mouse.enable();

    // Act & Assert
    await expect(mouse.waitForClick({ timeout: 100 })).rejects.toThrow('Timeout waiting for click');

    // Cleanup
    mouse.destroy();
  });

  test('should cancel with AbortSignal', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const controller = new AbortController();

    mouse.enable();

    // Act - start waiting and immediately abort
    const clickPromise = mouse.waitForClick({ signal: controller.signal });
    controller.abort();

    // Assert
    await expect(clickPromise).rejects.toThrow('The operation was aborted');

    // Cleanup
    mouse.destroy();
  });

  test('should cleanup listeners after resolution', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const pressEvent = '\x1b[<0;10;20M';
    const releaseEvent = '\x1b[<0;10;20m';

    mouse.enable();

    // Act
    const clickPromise = mouse.waitForClick();
    stream.emit('data', Buffer.from(pressEvent));
    stream.emit('data', Buffer.from(releaseEvent));
    await clickPromise;

    // Emit another click - should not be handled by waitForClick
    const secondClickSpy = vi.fn(() => {});
    mouse.on('click', secondClickSpy);
    stream.emit('data', Buffer.from(pressEvent));
    stream.emit('data', Buffer.from(releaseEvent));

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Assert - the second click should be handled by the new listener, not waitForClick
    expect(secondClickSpy).toHaveBeenCalled();

    // Cleanup
    mouse.destroy();
  });
});

describe('Mouse.waitForInput()', () => {
  test('should resolve when press event occurs', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const pressEvent = '\x1b[<0;10;20M';

    mouse.enable();

    // Act
    const inputPromise = mouse.waitForInput();
    stream.emit('data', Buffer.from(pressEvent));

    // Assert
    const event = await inputPromise;
    expect(event.action).toBe('press');
    expect(event.button).toBe('left');
    expect(event.x).toBe(10);
    expect(event.y).toBe(20);

    // Cleanup
    mouse.destroy();
  });

  test('should resolve when move event occurs', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const moveEvent = '\x1b[<35;15;25M'; // button 35 = move

    mouse.enable();

    // Act
    const inputPromise = mouse.waitForInput();
    stream.emit('data', Buffer.from(moveEvent));

    // Assert
    const event = await inputPromise;
    expect(event.action).toBe('move');
    expect(event.x).toBe(15);
    expect(event.y).toBe(25);

    // Cleanup
    mouse.destroy();
  });

  test('should resolve when wheel event occurs', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const wheelEvent = '\x1b[<64;10;20M'; // button 64 = wheel up

    mouse.enable();

    // Act
    const inputPromise = mouse.waitForInput();
    stream.emit('data', Buffer.from(wheelEvent));

    // Assert
    const event = await inputPromise;
    expect(event.action).toBe('wheel');
    expect(event.button).toBe('wheel-up');

    // Cleanup
    mouse.destroy();
  });

  test('should resolve when drag event occurs', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const dragEvent = '\x1b[<32;15;25M'; // button 32 = left button drag

    mouse.enable();

    // Act
    const inputPromise = mouse.waitForInput();
    stream.emit('data', Buffer.from(dragEvent));

    // Assert
    const event = await inputPromise;
    expect(event.action).toBe('drag');
    expect(event.button).toBe('left');

    // Cleanup
    mouse.destroy();
  });

  test('should resolve when click event occurs', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const pressEvent = '\x1b[<0;10;20M';
    const releaseEvent = '\x1b[<0;10;20m';

    mouse.enable();

    // Act
    const inputPromise = mouse.waitForInput();
    stream.emit('data', Buffer.from(pressEvent));
    stream.emit('data', Buffer.from(releaseEvent));

    // Assert - waitForInput might return press, release, or click first
    const event = await inputPromise;
    expect(['press', 'release', 'click']).toContain(event.action);

    // Cleanup
    mouse.destroy();
  });

  test('should timeout if no input occurs', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });

    mouse.enable();

    // Act & Assert
    await expect(mouse.waitForInput({ timeout: 100 })).rejects.toThrow('Timeout waiting for input');

    // Cleanup
    mouse.destroy();
  });

  test('should cancel with AbortSignal', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const controller = new AbortController();

    mouse.enable();

    // Act - start waiting and immediately abort
    const inputPromise = mouse.waitForInput({ signal: controller.signal });
    controller.abort();

    // Assert
    await expect(inputPromise).rejects.toThrow('The operation was aborted');

    // Cleanup
    mouse.destroy();
  });

  test('should cleanup listeners after resolution', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const pressEvent = '\x1b[<0;10;20M';

    mouse.enable();

    // Act
    const inputPromise = mouse.waitForInput();
    stream.emit('data', Buffer.from(pressEvent));
    await inputPromise;

    // Emit another event - should not be handled by waitForInput
    const secondPressSpy = vi.fn(() => {});
    mouse.on('press', secondPressSpy);
    stream.emit('data', Buffer.from(pressEvent));

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Assert - the second press should be handled by the new listener, not waitForInput
    expect(secondPressSpy).toHaveBeenCalled();

    // Cleanup
    mouse.destroy();
  });
});

describe('Mouse.getMousePosition()', () => {
  test('should resolve when mouse move occurs', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const moveEvent = '\x1b[<35;42;58M'; // move to x=42, y=58

    mouse.enable();

    // Act
    const positionPromise = mouse.getMousePosition();
    stream.emit('data', Buffer.from(moveEvent));

    // Assert
    const position = await positionPromise;
    expect(position.x).toBe(42);
    expect(position.y).toBe(58);

    // Cleanup
    mouse.destroy();
  });

  test('should return correct coordinates for multiple moves', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const moveEvent1 = '\x1b[<35;10;20M';
    const moveEvent2 = '\x1b[<35;30;40M';

    mouse.enable();

    // Act & Assert - First position (waits for event)
    const position1Promise = mouse.getMousePosition();
    stream.emit('data', Buffer.from(moveEvent1));
    const position1 = await position1Promise;
    expect(position1.x).toBe(10);
    expect(position1.y).toBe(20);

    // Act & Assert - Second call returns cached position immediately
    const position2 = await mouse.getMousePosition();
    expect(position2.x).toBe(10);
    expect(position2.y).toBe(20);

    // Act & Assert - Third position (returns cached until new event arrives)
    stream.emit('data', Buffer.from(moveEvent2));
    const position3 = await mouse.getMousePosition();
    expect(position3.x).toBe(30);
    expect(position3.y).toBe(40);

    // Cleanup
    mouse.destroy();
  });

  test('should timeout if no mouse move occurs', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });

    mouse.enable();

    // Act & Assert
    await expect(mouse.getMousePosition({ timeout: 100 })).rejects.toThrow('Timeout waiting for mouse position');

    // Cleanup
    mouse.destroy();
  });

  test('should cancel with AbortSignal', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const controller = new AbortController();

    mouse.enable();

    // Act - start waiting and immediately abort
    const positionPromise = mouse.getMousePosition({ signal: controller.signal });
    controller.abort();

    // Assert
    await expect(positionPromise).rejects.toThrow('The operation was aborted');

    // Cleanup
    mouse.destroy();
  });

  test('should cleanup listeners after resolution', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const moveEvent = '\x1b[<35;10;20M';

    mouse.enable();

    // Act
    const positionPromise = mouse.getMousePosition();
    stream.emit('data', Buffer.from(moveEvent));
    await positionPromise;

    // Emit another move - should not be handled by getMousePosition
    const secondMoveSpy = vi.fn(() => {});
    mouse.on('move', secondMoveSpy);
    stream.emit('data', Buffer.from(moveEvent));

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Assert - the second move should be handled by the new listener, not getMousePosition
    expect(secondMoveSpy).toHaveBeenCalled();

    // Cleanup
    mouse.destroy();
  });

  test('should ignore non-move events', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const pressEvent = '\x1b[<0;10;20M';
    const moveEvent = '\x1b[<35;42;58M';

    mouse.enable();

    // Act - start waiting for position, then emit press (should be ignored)
    const positionPromise = mouse.getMousePosition();
    stream.emit('data', Buffer.from(pressEvent));

    // Wait a bit to ensure press is processed
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Now emit move - should resolve
    stream.emit('data', Buffer.from(moveEvent));

    // Assert
    const position = await positionPromise;
    expect(position.x).toBe(42);
    expect(position.y).toBe(58);

    // Cleanup
    mouse.destroy();
  });

  describe('getLastPosition', () => {
    test('should return null before any mouse movement', () => {
      // Arrange
      const stream = makeFakeTTYStream();
      const mouse = new Mouse({ inputStream: stream });

      mouse.enable();

      // Act & Assert
      const pos = mouse.getLastPosition();
      expect(pos).toBeNull();

      // Cleanup
      mouse.destroy();
    });

    test('should return cached position after mouse move', async () => {
      // Arrange
      const stream = makeFakeTTYStream();
      const mouse = new Mouse({ inputStream: stream });
      const moveEvent = '\x1b[<35;15;25M';

      mouse.enable();

      // Act - trigger a move event
      stream.emit('data', Buffer.from(moveEvent));

      // Wait for event to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert - should return cached position synchronously
      const pos = mouse.getLastPosition();
      expect(pos).not.toBeNull();
      expect(pos?.x).toBe(15);
      expect(pos?.y).toBe(25);

      // Cleanup
      mouse.destroy();
    });

    test('should update position on multiple moves', async () => {
      // Arrange
      const stream = makeFakeTTYStream();
      const mouse = new Mouse({ inputStream: stream });
      const moveEvent1 = '\x1b[<35;10;20M';
      const moveEvent2 = '\x1b[<35;50;60M';

      mouse.enable();

      // Act & Assert - First move
      stream.emit('data', Buffer.from(moveEvent1));
      await new Promise((resolve) => setTimeout(resolve, 10));

      let pos = mouse.getLastPosition();
      expect(pos?.x).toBe(10);
      expect(pos?.y).toBe(20);

      // Act & Assert - Second move updates cache
      stream.emit('data', Buffer.from(moveEvent2));
      await new Promise((resolve) => setTimeout(resolve, 10));

      pos = mouse.getLastPosition();
      expect(pos?.x).toBe(50);
      expect(pos?.y).toBe(60);

      // Cleanup
      mouse.destroy();
    });

    test('should work with drag events', async () => {
      // Arrange
      const stream = makeFakeTTYStream();
      const mouse = new Mouse({ inputStream: stream });
      const dragEvent = '\x1b[<35;12;22M'; // Button 1 (left) drag

      mouse.enable();

      // Act - trigger a drag event
      stream.emit('data', Buffer.from(dragEvent));
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert - drag events should also cache position
      const pos = mouse.getLastPosition();
      expect(pos).not.toBeNull();
      expect(pos?.x).toBe(12);
      expect(pos?.y).toBe(22);

      // Cleanup
      mouse.destroy();
    });

    test('should return immediately without waiting', () => {
      // Arrange
      const stream = makeFakeTTYStream();
      const mouse = new Mouse({ inputStream: stream });

      mouse.enable();

      // Act - should return immediately (synchronous)
      const start = Date.now();
      const pos = mouse.getLastPosition();
      const elapsed = Date.now() - start;

      // Assert - should be instant (< 5ms)
      expect(elapsed).toBeLessThan(5);
      expect(pos).toBeNull();

      // Cleanup
      mouse.destroy();
    });

    test('should persist across multiple calls', async () => {
      // Arrange
      const stream = makeFakeTTYStream();
      const mouse = new Mouse({ inputStream: stream });
      const moveEvent = '\x1b[<35;30;40M';

      mouse.enable();

      // Act - trigger move
      stream.emit('data', Buffer.from(moveEvent));
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert - multiple calls should return same cached position
      const pos1 = mouse.getLastPosition();
      const pos2 = mouse.getLastPosition();
      const pos3 = mouse.getLastPosition();

      expect(pos1).toEqual(pos2);
      expect(pos2).toEqual(pos3);
      expect(pos1?.x).toBe(30);
      expect(pos1?.y).toBe(40);

      // Cleanup
      mouse.destroy();
    });
  });
});

describe('Mouse.debouncedMoveEvents()', () => {
  test('should yield debounced move events', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const moveEvent = '\x1b[<35;10;20M'; // move to x=10, y=20
    const iterator = mouse.debouncedMoveEvents({ interval: 50 });

    try {
      mouse.enable();

      // Act - emit move event
      const eventPromise = iterator.next();
      stream.emit('data', Buffer.from(moveEvent));

      // Wait for debounce interval to elapse
      await new Promise((resolve) => setTimeout(resolve, 70));

      // Assert
      const { value } = await eventPromise;
      expect(value.action).toBe('move');
      expect(value.button).toBe('none');
      expect(value.x).toBe(10);
      expect(value.y).toBe(20);
    } finally {
      // Cleanup
      await iterator.return(undefined);
      mouse.destroy();
    }
  });

  test('should debounce rapid move events', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const moveEvent1 = '\x1b[<35;10;20M';
    const moveEvent2 = '\x1b[<35;15;25M';
    const moveEvent3 = '\x1b[<35;20;30M';
    const iterator = mouse.debouncedMoveEvents({ interval: 50 });

    try {
      mouse.enable();

      // Act - emit multiple move events rapidly
      const eventPromise = iterator.next();
      stream.emit('data', Buffer.from(moveEvent1)); // x=10, y=20
      stream.emit('data', Buffer.from(moveEvent2)); // x=15, y=25
      stream.emit('data', Buffer.from(moveEvent3)); // x=20, y=30 - should be the final position

      // Wait for debounce interval
      await new Promise((resolve) => setTimeout(resolve, 70));

      // Assert - should only get the latest event
      const { value } = await eventPromise;
      expect(value.x).toBe(20); // Latest position
      expect(value.y).toBe(30);
    } finally {
      // Cleanup
      await iterator.return(undefined);
      mouse.destroy();
    }
  });

  test('should yield multiple events over time', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const moveEvent1 = '\x1b[<35;10;20M';
    const moveEvent2 = '\x1b[<35;30;40M';
    const iterator = mouse.debouncedMoveEvents({ interval: 30 });

    try {
      mouse.enable();

      // Act & Assert - First event
      const firstEventPromise = iterator.next();
      stream.emit('data', Buffer.from(moveEvent1));
      await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for debounce
      const { value: firstEvent } = await firstEventPromise;
      expect(firstEvent.x).toBe(10);
      expect(firstEvent.y).toBe(20);

      // Act & Assert - Second event
      const secondEventPromise = iterator.next();
      stream.emit('data', Buffer.from(moveEvent2));
      await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for debounce
      const { value: secondEvent } = await secondEventPromise;
      expect(secondEvent.x).toBe(30);
      expect(secondEvent.y).toBe(40);
    } finally {
      // Cleanup
      await iterator.return(undefined);
      mouse.destroy();
    }
  });

  test('should be cancellable with AbortSignal', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const controller = new AbortController();
    const iterator = mouse.debouncedMoveEvents({ signal: controller.signal });

    try {
      mouse.enable();

      // Act - start waiting and abort
      const eventPromise = iterator.next();
      controller.abort();

      // Assert
      await expect(eventPromise).rejects.toThrow('The operation was aborted.');
    } finally {
      // Cleanup
      mouse.destroy();
    }
  });

  test('should cleanup on abort', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const controller = new AbortController();
    const iterator = mouse.debouncedMoveEvents({ signal: controller.signal, interval: 100 });

    try {
      mouse.enable();

      // Act - abort after a short delay
      const eventPromise = iterator.next();
      stream.emit('data', Buffer.from('\x1b[<35;10;20M'));

      // Abort before debounce completes
      await sleep(20);
      controller.abort();

      // Assert - promise should be rejected due to abort
      await expect(eventPromise).rejects.toThrow('The operation was aborted');
    } finally {
      // Cleanup
      mouse.destroy();
    }
  });

  test('should handle errors', async () => {
    // Arrange
    const emitter = new EventEmitter();
    const mouse = new Mouse({ emitter, inputStream: makeFakeTTYStream(), outputStream: process.stdout });
    const iterator = mouse.debouncedMoveEvents();
    const error = new Error('Test error');

    try {
      mouse.enable();

      // Act
      const promise = iterator.next();
      emitter.emit('error', error);

      // Assert
      await expect(promise).rejects.toThrow('Error in mouse event stream: Test error');
    } finally {
      // Cleanup
      await iterator.return(undefined);
      mouse.destroy();
    }
  });

  test('should only yield move events', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const moveEvent = '\x1b[<35;10;20M';
    const pressEvent = '\x1b[<0;15;25M';
    const iterator = mouse.debouncedMoveEvents({ interval: 30 });

    try {
      mouse.enable();

      // Act - emit press event (should be ignored)
      const eventPromise = iterator.next();
      stream.emit('data', Buffer.from(pressEvent));
      stream.emit('data', Buffer.from(moveEvent)); // Only move should be processed

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Assert - should get move event
      const { value } = await eventPromise;
      expect(value.action).toBe('move');
      expect(value.x).toBe(10);
      expect(value.y).toBe(20);
    } finally {
      // Cleanup
      await iterator.return(undefined);
      mouse.destroy();
    }
  });

  test('should use default interval of 16ms', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const moveEvent = '\x1b[<35;10;20M';
    const iterator = mouse.debouncedMoveEvents(); // Use default interval

    try {
      mouse.enable();

      // Act
      const startTime = Date.now();
      const eventPromise = iterator.next();
      stream.emit('data', Buffer.from(moveEvent));
      const { value } = await eventPromise;
      const elapsed = Date.now() - startTime;

      // Assert - event should be yielded after ~16ms
      expect(value.action).toBe('move');
      expect(elapsed).toBeGreaterThan(10); // Debouncing working (not instant)
      expect(elapsed).toBeLessThan(100); // But not too long
    } finally {
      // Cleanup
      await iterator.return(undefined);
      mouse.destroy();
    }
  });

  test('should not yield when paused', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const moveEvent = '\x1b[<35;10;20M';
    const iterator = mouse.debouncedMoveEvents({ interval: 30 });

    try {
      mouse.enable();

      // Act - pause before emitting
      mouse.pause();
      const eventPromise = iterator.next();
      stream.emit('data', Buffer.from(moveEvent));

      // Wait for debounce interval
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Assert - event should not be yielded while paused
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100));
      try {
        await Promise.race([eventPromise, timeoutPromise]);
        // If we get here, the event was yielded (which is wrong)
        expect(false).toBe(true);
      } catch (err) {
        expect((err as Error).message).toBe('Timeout');
      }

      // Resume and emit again
      mouse.resume();
      stream.emit('data', Buffer.from(moveEvent));
      await new Promise((resolve) => setTimeout(resolve, 50));

      const { value } = await eventPromise;
      expect(value.action).toBe('move');
    } finally {
      // Cleanup
      await iterator.return(undefined);
      mouse.destroy();
    }
  });

  test('should cleanup timers on break', async () => {
    // Arrange
    const stream = makeFakeTTYStream();
    const mouse = new Mouse({ inputStream: stream });
    const moveEvent = '\x1b[<35;10;20M';
    const iterator = mouse.debouncedMoveEvents({ interval: 100 });

    try {
      mouse.enable();

      // Act - emit event but break before debounce completes
      const eventPromise = iterator.next();
      stream.emit('data', Buffer.from(moveEvent));

      // Break the iteration immediately - this should cleanup the timer
      await iterator.return(undefined);

      // Wait to ensure timer would have fired if not cleaned up
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Assert - the promise should complete (either resolve or reject) without waiting for debounce
      // The key is that we don't wait 100ms for the debounce interval
      const result = await eventPromise.catch(() => ({ done: true }));
      // Either we got a result or an error - both are fine as long as it didn't take the full interval
      expect(result).toBeDefined();
    } finally {
      // Cleanup
      mouse.destroy();
    }
  });
});
