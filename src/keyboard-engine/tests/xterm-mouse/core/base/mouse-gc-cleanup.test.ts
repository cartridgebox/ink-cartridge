import { EventEmitter } from "node:events";
import { describe, expect, test } from "vitest";

import { ANSI_CODES } from "../../../../src/xterm-mouse/parser/constants.js";
import type { ReadableStreamWithEncoding } from "../../../../src/xterm-mouse/types/index.js";
import { Mouse } from "../../../../src/xterm-mouse/core/Mouse.js";

const gcEnabled = typeof global.gc !== "undefined";

type FakeOutput = {
	write: (chunk: string) => boolean;
	written: string[];
};

function makeFakeOutputStream(): FakeOutput {
	const written: string[] = [];
	return {
		written,
		write: (chunk: string) => {
			written.push(chunk);
			return true;
		},
	};
}

type FakeTTYStream = ReadableStreamWithEncoding & {
	detachCount: () => number;
};

function makeFakeTTYStream(): FakeTTYStream {
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
	let detaches = 0;

	// Node's EventEmitter.on/off are overloaded; the fake only implements the
	// generic signature, so the assertion to the stream's declared type is safe
	// for the single-argument listener the mouse controller registers.
	fake.on = ((event: string, listener: (...args: unknown[]) => void) => {
		originalOn(event, listener);
		return fake;
	}) as typeof fake.on;
	fake.off = ((event: string, listener: (...args: unknown[]) => void) => {
		if (event === "data") detaches++;
		originalOff(event, listener);
		return fake;
	}) as typeof fake.off;

	return Object.assign(fake, { detachCount: () => detaches });
}

// Keep the instance in a separate frame: a local inside the async test body can
// stay reachable from its context and make the collection assertion flaky.
function createEnabledMouseWeakRef(
	input: FakeTTYStream,
	output: FakeOutput,
): WeakRef<Mouse> {
	// TTYController only calls `write` on the output stream; the fake
	// deliberately implements that subset instead of the full WriteStream.
	const mouse = new Mouse({
		inputStream: input,
		outputStream: output as unknown as NodeJS.WriteStream,
	});
	mouse.enable();
	return new WeakRef(mouse);
}

describe("Mouse GC cleanup", () => {
	test("is collected and restores the terminal when destroy() is forgotten", async () => {
		if (!gcEnabled) {
			console.log(
				"Skipping test: --expose-gc flag not set. Run with: NODE_OPTIONS=--expose-gc npx vitest run",
			);
			return;
		}

		const input = makeFakeTTYStream();
		const output = makeFakeOutputStream();
		const weak = createEnabledMouseWeakRef(input, output);

		// Do not call deref() while collecting: a target returned by deref() is
		// kept alive until the end of the current job, which would defeat gc().
		for (let i = 0; i < 20; i++) {
			global.gc?.();
			await new Promise((resolve) => setTimeout(resolve, 30));
		}

		expect(weak.deref()).toBeUndefined();

		// FinalizationRegistry callbacks run after collection.
		for (let i = 0; i < 20 && input.detachCount() === 0; i++) {
			await new Promise((resolve) => setTimeout(resolve, 30));
		}

		// The cleanup removed the stdin listener, restored raw mode, and turned
		// mouse reporting off.
		expect(input.detachCount()).toBe(1);
		expect(input.isRaw).toBe(false);
		expect(output.written.join("")).toContain(ANSI_CODES.mouseSGR.off);
	});
});
