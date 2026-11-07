import { EventEmitter } from 'node:events';
import { describe, expect, test } from 'vitest';
import { MouseEventManager } from '../../../../src/xterm-mouse/core/MouseEventManager.js';

const SGR_PRESS_LEFT = '\x1b[<0;10;20M';
const SGR_RELEASE_LEFT = '\x1b[<0;10;20m';

function setup() {
  const emitter = new EventEmitter();
  const manager = new MouseEventManager(emitter);
  return { emitter, manager };
}

describe('MouseEventManager chunked input', () => {
  test('emits a press when the report is split across data events', () => {
    const { emitter, manager } = setup();
    const presses: Array<Record<string, unknown>> = [];
    emitter.on('press', (event: Record<string, unknown>) => presses.push(event));

    manager.handleEvent(Buffer.from('\x1b[<0;10;'), false);
    expect(presses).toHaveLength(0);

    manager.handleEvent(Buffer.from('20M'), false);
    expect(presses).toHaveLength(1);
    expect(presses[0]).toMatchObject({ action: 'press', x: 10, y: 20 });
  });

  test('emits one event when the report is split into three chunks', () => {
    const { emitter, manager } = setup();
    const presses: Array<Record<string, unknown>> = [];
    emitter.on('press', (event: Record<string, unknown>) => presses.push(event));

    manager.handleEvent(Buffer.from('\x1b[<0;'), false);
    manager.handleEvent(Buffer.from('10;'), false);
    manager.handleEvent(Buffer.from('20M'), false);

    expect(presses).toHaveLength(1);
  });

  test('keeps a complete event from the same chunk that ends in a prefix', () => {
    const { emitter, manager } = setup();
    const presses: Array<Record<string, unknown>> = [];
    const releases: Array<Record<string, unknown>> = [];
    emitter.on('press', (event: Record<string, unknown>) => presses.push(event));
    emitter.on('release', (event: Record<string, unknown>) => releases.push(event));

    manager.handleEvent(Buffer.from(`${SGR_PRESS_LEFT}\x1b[<0;30;`), false);
    expect(presses).toHaveLength(1);
    expect(releases).toHaveLength(0);

    manager.handleEvent(Buffer.from('40m'), false);
    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({ action: 'release', x: 30, y: 40 });
  });

  test('emits a click when the release is split', async () => {
    const { emitter, manager } = setup();
    let clicks = 0;
    emitter.on('click', () => clicks++);

    manager.handleEvent(Buffer.from(SGR_PRESS_LEFT), false);
    manager.handleEvent(Buffer.from('\x1b[<0;'), false);
    manager.handleEvent(Buffer.from('10;20m'), false);

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(clicks).toBe(1);
  });

  test('drops a pending prefix while paused', () => {
    const { emitter, manager } = setup();
    const presses: Array<Record<string, unknown>> = [];
    emitter.on('press', (event: Record<string, unknown>) => presses.push(event));

    manager.handleEvent(Buffer.from('\x1b[<0;10;'), false);
    // The chunk carrying the rest arrives while paused: it is dropped and the
    // half-received prefix must not survive to be completed later.
    manager.handleEvent(Buffer.from('20M'), true);
    manager.handleEvent(Buffer.from('20M'), false);

    expect(presses).toHaveLength(0);
  });

  test('clearPending drops a partial prefix', () => {
    const { emitter, manager } = setup();
    const presses: Array<Record<string, unknown>> = [];
    emitter.on('press', (event: Record<string, unknown>) => presses.push(event));

    manager.handleEvent(Buffer.from('\x1b[<0;10;'), false);
    manager.clearPending();
    manager.handleEvent(Buffer.from('20M'), false);

    expect(presses).toHaveLength(0);
  });

  test('reset drops a partial prefix', () => {
    const { emitter, manager } = setup();
    const presses: Array<Record<string, unknown>> = [];
    emitter.on('press', (event: Record<string, unknown>) => presses.push(event));

    manager.handleEvent(Buffer.from('\x1b[<0;10;'), false);
    manager.reset();
    manager.handleEvent(Buffer.from('20M'), false);

    expect(presses).toHaveLength(0);
  });

  test('a complete release alone still produces no click without a press', async () => {
    const { emitter, manager } = setup();
    let clicks = 0;
    emitter.on('click', () => clicks++);

    manager.handleEvent(Buffer.from(SGR_RELEASE_LEFT), false);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(clicks).toBe(0);
  });
});
