import { EventEmitter } from 'node:events';
import { describe, expect, test } from 'vitest';
import type { ReadableStreamWithEncoding } from '../../../../src/xterm-mouse/types/index.js';
import { Mouse } from '../../../../src/xterm-mouse/core/Mouse.js';

type FakeOutput = {
  write: (chunk: string) => boolean;
};

function makeFakeTTYStream(): ReadableStreamWithEncoding {
  // The fake implements the small surface TTYController touches (isTTY,
  // setRawMode, setEncoding, on/off, resume/pause); asserting the
  // EventEmitter avoids stubbing the full NodeJS.ReadStream interface.
  const fake = new EventEmitter() as ReadableStreamWithEncoding;
  fake.isTTY = true;
  fake.isRaw = false;
  let encoding: BufferEncoding | null = null;

  fake.setRawMode = (mode: boolean) => {
    fake.isRaw = mode;
    return fake;
  };
  fake.setEncoding = (enc: BufferEncoding) => {
    encoding = enc;
    return fake;
  };
  fake.readableEncoding = encoding;
  fake.resume = () => fake;
  fake.pause = () => fake;

  const originalOn = fake.on.bind(fake);
  const originalOff = fake.off.bind(fake);
  // EventEmitter's on/off are overloaded; the fake implements the generic
  // signature only, so assert the wrapper to the stream's declared type.
  fake.on = ((event: string, listener: (...args: unknown[]) => void) => {
    originalOn(event, listener);
    return fake;
  }) as typeof fake.on;
  fake.off = ((event: string, listener: (...args: unknown[]) => void) => {
    originalOff(event, listener);
    return fake;
  }) as typeof fake.off;
  return fake;
}

function setup() {
  const input = makeFakeTTYStream();
  // TTYController only calls write() on the output stream.
  const output: FakeOutput = { write: () => true };
  const mouse = new Mouse({
    inputStream: input,
    outputStream: output as unknown as NodeJS.WriteStream,
  });

  const presses: Array<{ action: string; x: number; y: number }> = [];
  const listen = () => {
    mouse.on('press', (event) => {
      presses.push({ action: event.action, x: event.x, y: event.y });
    });
  };
  listen();
  mouse.enable();

  return { input, mouse, presses, listen };
}

const PARTIAL = '\x1b[<0;10;';
const REST = '20M';
const COMPLETE = '\x1b[<0;10;20M';

function emit(input: ReadableStreamWithEncoding, data: string): void {
  input.emit('data', Buffer.from(data));
}

describe('Mouse lifecycle clears a partial report', () => {
  test('pause() and resume() drop the prefix', () => {
    const { input, mouse, presses } = setup();
    emit(input, PARTIAL);

    mouse.pause();
    mouse.resume();
    // Without clearing, the old prefix would complete with this chunk.
    emit(input, REST);
    expect(presses).toHaveLength(0);

    emit(input, COMPLETE); // the manager still works after resuming
    expect(presses).toHaveLength(1);

    mouse.destroy();
  });

  test('disable() drops the prefix', () => {
    const { input, mouse, presses } = setup();
    emit(input, PARTIAL);

    mouse.disable();
    mouse.enable();
    // Without clearing, the old prefix would complete with this chunk.
    emit(input, REST);
    expect(presses).toHaveLength(0);

    emit(input, COMPLETE);
    expect(presses).toHaveLength(1);

    mouse.destroy();
  });

  test('destroy() drops the prefix', () => {
    const { input, mouse, presses, listen } = setup();
    emit(input, PARTIAL);

    mouse.destroy();
    // destroy removed the listeners; re-register and re-enable to observe the
    // manager's buffer state.
    listen();
    mouse.enable();
    emit(input, REST);
    expect(presses).toHaveLength(0);

    mouse.destroy();
  });
});
