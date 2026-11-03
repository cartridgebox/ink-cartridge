import { EventEmitter } from "node:events";
import { describe, expect, test } from "vitest";

import type { ReadableStreamWithEncoding } from "../../../../src/xterm-mouse/types/index.js";
import { Mouse } from "../../../../src/xterm-mouse/core/Mouse.js";

const gcEnabled = typeof global.gc !== "undefined";

function makeFakeTTYStream(): ReadableStreamWithEncoding {
	const fake = new EventEmitter() as ReadableStreamWithEncoding;
	fake.isTTY = true;
	fake.isRaw = false;
	fake.setRawMode = (mode: boolean) => {
		fake.isRaw = mode;
		return fake;
	};
	fake.setEncoding = () => fake;
	fake.resume = () => fake;
	fake.pause = () => fake;
	const originalOn = fake.on.bind(fake);
	const originalOff = fake.off.bind(fake);
	fake.on = (event: string, listener: (...args: any[]) => void) => {
		originalOn(event, listener);
		return fake;
	};
	fake.off = (event: string, listener: (...args: unknown[]) => void) => {
		originalOff(event, listener);
		return fake;
	};
	return fake;
}

// Keep the instance in a separate frame: a local inside the async test body can
// stay reachable from its context and make the collection assertion flaky.
function createEnabledMouseWeakRef(
	stream: ReadableStreamWithEncoding,
): WeakRef<Mouse> {
	const mouse = new Mouse({ inputStream: stream });
	mouse.enable();
	return new WeakRef(mouse);
}

describe("Mouse GC cleanup", () => {
	test("is collected when destroy() is forgotten", async () => {
		if (!gcEnabled) {
			console.log(
				"Skipping test: --expose-gc flag not set. Run with: NODE_OPTIONS=--expose-gc npx vitest run",
			);
			return;
		}

		const stream = makeFakeTTYStream();
		const weak = createEnabledMouseWeakRef(stream);

		for (let i = 0; i < 20; i++) {
			global.gc?.();
			await new Promise((resolve) => setTimeout(resolve, 30));
		}

		expect(weak.deref()).toBeUndefined();
	});
});
