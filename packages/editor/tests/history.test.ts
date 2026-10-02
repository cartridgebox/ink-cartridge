import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Document } from "../src/core/document/document.js";
import { History } from "../src/core/document/history.js";
import {
	DeleteBeforeOp,
	InsertTextOp,
	JoinLineOp,
	SplitLineOp,
} from "../src/core/document/operations.js";
import { EditorController } from "../src/core/editor-controller.js";
import { EditorSession } from "../src/core/io/session.js";

/** Document with the cursor parked at (line, logical). */
function docAt(text: string, line = 0, logical = 0): Document {
	const doc = new Document(text);
	doc.setCursor(line, logical);
	return doc;
}

describe("History", () => {
	it("undo restores text and cursor; redo re-applies", () => {
		const doc = docAt("ac", 0, 1);
		const history = new History();
		history.run(new InsertTextOp("b"), doc);
		expect(doc.lines).toEqual(["abc"]);

		expect(history.undo(doc)).toBe(true);
		expect(doc.lines).toEqual(["ac"]);
		expect(doc.cursor).toMatchObject({ line: 0, logical: 1 });

		expect(history.redo(doc)).toBe(true);
		expect(doc.lines).toEqual(["abc"]);
		expect(doc.cursor).toMatchObject({ line: 0, logical: 2 });
	});

	it("undo after the cursor moved still deletes the right span", () => {
		// The cursor is not part of the redo/undo stacks' key, but it IS part of
		// each entry: invert() only deletes the correct text when the cursor is
		// restored to where the original apply() left it. Without that restore,
		// a since-moved cursor makes invert delete the wrong characters.
		const doc = docAt("a", 0, 1);
		const history = new History();
		history.run(new InsertTextOp("bc"), doc);
		doc.setCursor(0, 0);
		history.undo(doc);
		expect(doc.lines).toEqual(["a"]);
		expect(doc.cursor).toMatchObject({ line: 0, logical: 1 });
	});

	it("undoes multiple edits in reverse order", () => {
		// Splits do not merge, so each stays its own step.
		const doc = docAt("ab", 0, 1);
		const history = new History();
		history.run(new SplitLineOp(), doc);
		history.run(new SplitLineOp(), doc);
		expect(doc.lines).toEqual(["a", "", "b"]);

		history.undo(doc);
		expect(doc.lines).toEqual(["a", "b"]);
		history.undo(doc);
		expect(doc.lines).toEqual(["ab"]);
	});

	it("a new edit discards the redo branch", () => {
		const doc = docAt("a", 0, 1);
		const history = new History();
		history.run(new InsertTextOp("b"), doc);
		history.undo(doc);
		expect(history.canRedo()).toBe(true);

		history.run(new InsertTextOp("c"), doc);
		expect(history.canRedo()).toBe(false);
		expect(history.redo(doc)).toBe(false);
		expect(doc.lines).toEqual(["ac"]);
	});

	it("undo and redo report empty stacks", () => {
		const doc = docAt("a");
		const history = new History();
		expect(history.canUndo()).toBe(false);
		expect(history.canRedo()).toBe(false);
		expect(history.undo(doc)).toBe(false);
		expect(history.redo(doc)).toBe(false);
	});

	it("drops the oldest entry past the limit", () => {
		// Advance past the merge window so each insert is its own entry.
		let now = 0;
		const history = new History(2, () => now);
		const doc = docAt("");
		history.run(new InsertTextOp("a"), doc);
		now += 600;
		history.run(new InsertTextOp("b"), doc);
		now += 600;
		history.run(new InsertTextOp("c"), doc);
		expect(doc.lines).toEqual(["abc"]);

		history.undo(doc);
		history.undo(doc);
		expect(history.canUndo()).toBe(false);
		expect(doc.lines).toEqual(["a"]);
	});

	it("clear drops both stacks", () => {
		const doc = docAt("a", 0, 1);
		const history = new History();
		history.run(new InsertTextOp("b"), doc);
		history.undo(doc);
		history.clear();
		expect(history.canUndo()).toBe(false);
		expect(history.canRedo()).toBe(false);
	});

	it("undoing a no-op joinLine leaves the document intact", () => {
		// A single line has nothing to join, so apply() does nothing; its
		// inverse must do nothing too, or undo would split the line.
		const doc = docAt("abc", 0, 1);
		const history = new History();
		history.run(new JoinLineOp(), doc);
		expect(doc.lines).toEqual(["abc"]);
		history.undo(doc);
		expect(doc.lines).toEqual(["abc"]);
	});
});

describe("History coalescing", () => {
	/** History with a controllable clock, advanced by assigning `now`. */
	function clocked(): { history: History; advanceTo: (ms: number) => void } {
		let now = 0;
		const history = new History(200, () => now);
		return { history, advanceTo: (ms) => { now = ms; } };
	}

	it("merges adjacent insertions within the window into one step", () => {
		const { history, advanceTo } = clocked();
		const doc = docAt("");
		history.run(new InsertTextOp("h"), doc);
		advanceTo(100);
		history.run(new InsertTextOp("i"), doc);
		expect(doc.lines).toEqual(["hi"]);

		history.undo(doc);
		expect(doc.lines).toEqual([""]);
		expect(history.canUndo()).toBe(false);
		expect(history.canRedo()).toBe(true);

		history.redo(doc);
		expect(doc.lines).toEqual(["hi"]);
	});

	it("starts a new step when the pause exceeds the window", () => {
		const { history, advanceTo } = clocked();
		const doc = docAt("");
		history.run(new InsertTextOp("h"), doc);
		advanceTo(600);
		history.run(new InsertTextOp("i"), doc);

		history.undo(doc);
		expect(doc.lines).toEqual(["h"]);
		expect(history.canUndo()).toBe(true);
	});

	it("does not merge across a cursor move", () => {
		const { history, advanceTo } = clocked();
		const doc = docAt("");
		history.run(new InsertTextOp("ab"), doc);
		doc.setCursor(0, 0);
		advanceTo(100);
		history.run(new InsertTextOp("x"), doc);
		expect(doc.lines).toEqual(["xab"]);

		history.undo(doc);
		expect(doc.lines).toEqual(["ab"]);
		history.undo(doc);
		expect(doc.lines).toEqual([""]);
	});

	it("does not merge an insertion into a non-insertion edit", () => {
		const { history, advanceTo } = clocked();
		const doc = docAt("ab", 0, 2);
		history.run(new InsertTextOp("c"), doc);
		history.run(new DeleteBeforeOp(), doc);
		advanceTo(100);
		history.run(new InsertTextOp("d"), doc);
		expect(doc.lines).toEqual(["abd"]);

		history.undo(doc);
		expect(doc.lines).toEqual(["ab"]);
		history.undo(doc);
		expect(doc.lines).toEqual(["abc"]);
	});

	it("does not merge when the window is 0", () => {
		const { history, advanceTo } = clocked();
		history.setMergeWindow(0);
		const doc = docAt("");
		history.run(new InsertTextOp("a"), doc);
		advanceTo(100);
		history.run(new InsertTextOp("b"), doc);
		expect(doc.lines).toEqual(["ab"]);

		// Each insert is its own step, so the first undo removes only "b".
		history.undo(doc);
		expect(doc.lines).toEqual(["a"]);
		history.undo(doc);
		expect(doc.lines).toEqual([""]);
	});

	it("merges across a window wider than the default", () => {
		const { history, advanceTo } = clocked();
		history.setMergeWindow(1000);
		const doc = docAt("");
		history.run(new InsertTextOp("a"), doc);
		// 800ms is past the 500ms default but inside the widened window.
		advanceTo(800);
		history.run(new InsertTextOp("b"), doc);
		expect(doc.lines).toEqual(["ab"]);

		history.undo(doc);
		expect(doc.lines).toEqual([""]);
	});
});

describe("EditorController + History", () => {
	it("routes editing commands through undo and redo", () => {
		const controller = new EditorController("ac");
		controller.document.setCursor(0, 1);
		controller.execute("editor.insertText", { text: "b" });
		expect(controller.document.lines).toEqual(["abc"]);

		controller.execute("history.undo");
		expect(controller.document.lines).toEqual(["ac"]);
		controller.execute("history.redo");
		expect(controller.document.lines).toEqual(["abc"]);
	});

	it("does not record cursor movement", () => {
		const controller = new EditorController("abc");
		controller.execute("cursor.lineEnd");
		controller.execute("cursor.lineStart");
		expect(controller.history.canUndo()).toBe(false);
	});

	it("history.undo with an empty history is a no-op", () => {
		const controller = new EditorController("a");
		controller.execute("history.undo");
		expect(controller.document.lines).toEqual(["a"]);
	});
});

describe("EditorSession + History", () => {
	it("opening a file resets the undo history", () => {
		const dir = mkdtempSync(join(tmpdir(), "blots-history-"));
		const file = join(dir, "note.md");
		writeFileSync(file, "hello", "utf8");

		const session = new EditorSession("seed");
		session.controller.document.setCursor(0, 4);
		session.controller.execute("editor.insertText", { text: "!" });
		expect(session.controller.history.canUndo()).toBe(true);

		expect(session.open(file).ok).toBe(true);
		expect(session.controller.history.canUndo()).toBe(false);
		expect(session.controller.document.lines).toEqual(["hello"]);
	});
});
