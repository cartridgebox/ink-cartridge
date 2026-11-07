import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MouseEventManager } from '../../../../src/xterm-mouse/core/MouseEventManager.js';

vi.mock('../../../../src/xterm-mouse/parser/ansiParser.js', () => ({
  parseMouseEventChunk: vi.fn((data: string) => {
    const event = (action: string, x: number, y: number, button = 'left') => ({
      x,
      y,
      button,
      action,
      shift: false,
      alt: false,
      ctrl: false,
      raw: 0,
      data: '',
      protocol: 'SGR',
    });

    // Simple mock parser that returns basic events
    if (data.includes('press')) {
      return { events: [event('press', 10, 10)], remainder: '' };
    }
    if (data.includes('release')) {
      return { events: [event('release', 11, 10)], remainder: '' };
    }
    if (data.includes('move')) {
      return { events: [event('move', 15, 15, 'none')], remainder: '' };
    }
    if (data.includes('drag')) {
      return { events: [event('drag', 20, 20)], remainder: '' };
    }
    return { events: [], remainder: '' };
  }) as unknown as typeof import('../../../../src/xterm-mouse/parser/ansiParser.js').parseMouseEventChunk,
}));

// Import the mocked module
import { parseMouseEventChunk } from '../../../../src/xterm-mouse/parser/ansiParser.js';

// Use Vitest's mocked utility for type-safe mock access
const mockParseMouseEventChunk = vi.mocked(parseMouseEventChunk);

describe('MouseEventManager', () => {
  let eventManager: MouseEventManager;
  let mockEmitter: EventEmitter;

  beforeEach(() => {
    mockEmitter = new EventEmitter();
    eventManager = new MouseEventManager(mockEmitter);
  });

  describe('event emission', () => {
    test('emits events through EventEmitter', () => {
      // Arrange
      const handler = vi.fn();
      mockEmitter.on('press', handler);

      // Act
      eventManager.handleEvent(Buffer.from('press'), false);

      // Assert
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'press',
        }),
      );
    });

    test('does NOT emit events when paused', () => {
      // Arrange
      const handler = vi.fn();
      mockEmitter.on('press', handler);

      // Act
      eventManager.handleEvent(Buffer.from('press'), true);

      // Assert
      expect(handler).not.toHaveBeenCalled();
    });

    test('emits error event when parsing fails', () => {
      // Arrange
      const errorHandler = vi.fn();
      mockEmitter.on('error', errorHandler);

      // Act - trigger parse error (mock will return empty array)
      mockParseMouseEventChunk.mockImplementationOnce(() => {
        throw new Error('Parse error');
      });
      eventManager.handleEvent(Buffer.from('invalid'), false);

      // Assert
      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('click detection', () => {
    test('emits click event for press+release within threshold', async () => {
      // Arrange
      const clickHandler = vi.fn();
      mockEmitter.on('click', clickHandler);

      // Use the same position for both press and release.
      mockParseMouseEventChunk
        .mockImplementationOnce(() => ({
          events: [
            { x: 10, y: 10, button: 'left', action: 'press', shift: false, alt: false, ctrl: false, raw: 0, data: '', protocol: 'SGR' },
          ],
          remainder: '',
        }))
        .mockImplementationOnce(() => ({
          events: [
            { x: 10, y: 10, button: 'left', action: 'release', shift: false, alt: false, ctrl: false, raw: 0, data: '', protocol: 'SGR' },
          ],
          remainder: '',
        }));

      // Act
      eventManager.handleEvent(Buffer.from('press'), false);
      await new Promise<void>((resolve) =>
        setImmediate(() => {
          eventManager.handleEvent(Buffer.from('release'), false);
          setImmediate(() => resolve());
        }),
      );

      // Wait for nextTick
      await new Promise<void>((resolve) =>
        setImmediate(() => {
          expect(clickHandler).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'click',
            }),
          );
          resolve();
        }),
      );
    });

    test('tracks position from move events', () => {
      // Arrange
      const moveHandler = vi.fn();
      mockEmitter.on('move', moveHandler);

      // Act
      eventManager.handleEvent(Buffer.from('move'), false);
      const position = eventManager.getLastPosition();

      // Assert
      expect(moveHandler).toHaveBeenCalled();
      expect(position).toEqual({ x: 15, y: 15 });
    });

    test('tracks position from drag events', () => {
      // Arrange
      const dragHandler = vi.fn();
      mockEmitter.on('drag', dragHandler);

      // Act
      eventManager.handleEvent(Buffer.from('drag'), false);
      const position = eventManager.getLastPosition();

      // Assert
      expect(dragHandler).toHaveBeenCalled();
      expect(position).toEqual({ x: 20, y: 20 });
    });
  });

  describe('EventEmitter methods', () => {
    test('registers listeners with on()', () => {
      // Arrange
      const handler = vi.fn();

      // Act
      eventManager.on('press', handler);
      mockEmitter.emit('press', { x: 10, y: 10, button: 'left', action: 'press' });

      // Assert
      expect(handler).toHaveBeenCalled();
    });

    test('removes listeners with off()', () => {
      // Arrange
      const handler = vi.fn();
      eventManager.on('press', handler);

      // Act
      eventManager.off('press', handler);
      mockEmitter.emit('press', { x: 10, y: 10, button: 'left', action: 'press' });

      // Assert
      expect(handler).not.toHaveBeenCalled();
    });

    test('registers one-time listeners with once()', () => {
      // Arrange
      const handler = vi.fn();

      // Act
      eventManager.once('press', handler);
      mockEmitter.emit('press', { x: 10, y: 10, button: 'left', action: 'press' });
      mockEmitter.emit('press', { x: 15, y: 15, button: 'left', action: 'press' });

      // Assert
      expect(handler).toHaveBeenCalledTimes(1); // Only called once despite two emits
    });

    test('returns EventEmitter from on()', () => {
      // Arrange & Act
      const result = eventManager.on('press', vi.fn());

      // Assert
      expect(result).toBe(mockEmitter);
    });

    test('returns EventEmitter from off()', () => {
      // Arrange & Act
      const result = eventManager.off('press', vi.fn());

      // Assert
      expect(result).toBe(mockEmitter);
    });

    test('returns EventEmitter from once()', () => {
      // Arrange & Act
      const result = eventManager.once('press', vi.fn());

      // Assert
      expect(result).toBe(mockEmitter);
    });
  });

  describe('getEmitter', () => {
    test('returns the underlying EventEmitter', () => {
      // Arrange & Act
      const emitter = eventManager.getEmitter();

      // Assert
      expect(emitter).toBe(mockEmitter);
    });
  });

  describe('removeAllListeners', () => {
    test('removes all listeners from emitter', () => {
      // Arrange
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      mockEmitter.on('press', handler1);
      mockEmitter.on('release', handler2);

      // Act
      eventManager.removeAllListeners();
      mockEmitter.emit('press', { x: 10, y: 10, button: 'left', action: 'press' });
      mockEmitter.emit('release', { x: 10, y: 10, button: 'left', action: 'release' });

      // Assert
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    test('clears click detector state', () => {
      // Arrange
      const clickHandler = vi.fn();
      mockEmitter.on('click', clickHandler);

      // Act
      eventManager.handleEvent(Buffer.from('press'), false);
      eventManager.reset();
      eventManager.handleEvent(Buffer.from('release'), false);

      // Wait for nextTick
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(clickHandler).not.toHaveBeenCalled();
          resolve();
        }, 10);
      });
    });

    test('clears position tracker state', () => {
      // Arrange
      eventManager.handleEvent(Buffer.from('move'), false);

      // Act
      eventManager.reset();
      const position = eventManager.getLastPosition();

      // Assert
      expect(position).toBeNull();
    });
  });

  describe('with custom options', () => {
    test('respects custom clickDistanceThreshold', async () => {
      // Arrange
      const manager = new MouseEventManager(mockEmitter, { clickDistanceThreshold: 0 });
      const clickHandler = vi.fn();
      mockEmitter.on('click', clickHandler);

      // With threshold 0, our default mock returns press at (10,10) and release at (11,10)
      // Distance is 1, threshold is 0, so no click should be detected

      // Act
      manager.handleEvent(Buffer.from('press'), false);
      await new Promise<void>((resolve) =>
        setImmediate(() => {
          manager.handleEvent(Buffer.from('release'), false);
          setImmediate(() => resolve());
        }),
      );

      // Wait for nextTick to verify no click was emitted
      await new Promise<void>((resolve) =>
        setImmediate(() => {
          expect(clickHandler).not.toHaveBeenCalled();
          resolve();
        }),
      );
    });
  });
});
