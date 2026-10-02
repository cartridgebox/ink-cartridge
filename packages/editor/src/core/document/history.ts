import { MERGE_WINDOW_DEFAULT } from "../settings/schema.js";
import type { Document } from "./document.js";
import type { EditOperation } from "./operations.js";
import type { Position } from "./position.js";

/** One undoable edit: the operation plus the cursor before and after it ran. */
export type HistoryEntry = {
	op: EditOperation;
	/** Cursor before `apply`; undo leaves the cursor here. */
	cursorBefore: Position;
	/** Cursor after `apply`; redo leaves the cursor here, and undo starts here. */
	cursorAfter: Position;
	/** When the edit ran, used to group consecutive edits into one undo step. */
	time: number;
};

/**
 * Linear undo/redo stack over {@link EditOperation}s.
 *
 * Stores each operation together with the cursor positions around it. The
 * cursor is part of the record — not reconstructed from the operation —
 * because editing and cursor movement are independent: the user may move the
 * cursor (an action that is not itself undoable) before pressing undo, so the
 * position `invert` expects cannot be assumed to still hold.
 *
 * A burst of mergeable edits (see {@link EditOperation.merge}) that land next
 * to each other within the merge window collapses into one entry, so typing a
 * word undoes as a word rather than a character. Any other edit, a cursor
 * move, or a pause longer than the window starts a new entry. The window is a
 * user setting (see `setMergeWindow`); `0` disables merging.
 */
export class History {
	private readonly _undo: HistoryEntry[] = [];
	private readonly _redo: HistoryEntry[] = [];
	private readonly _limit: number;
	private readonly _now: () => number;
	private _mergeWindow = MERGE_WINDOW_DEFAULT;

	constructor(limit = 200, now: () => number = Date.now) {
		this._limit = limit;
		this._now = now;
	}

	/**
	 * Set the coalescing window in ms. Edits closer together than this share an
	 * undo step; `0` disables merging, so every edit stands alone.
	 */
	setMergeWindow(ms: number): void {
		this._mergeWindow = ms;
	}

	canUndo(): boolean {
		return this._undo.length > 0;
	}

	canRedo(): boolean {
		return this._redo.length > 0;
	}

	/**
	 * Apply `op` and record it. Capturing the cursor here (rather than in the
	 * caller) keeps the entry and the operation's effects in sync by
	 * construction. A new edit discards the redo branch, since the document
	 * has diverged from the state those entries would replay onto.
	 *
	 * A no-op edit (e.g. backspace at the document start) is not recorded: its
	 * inverse would do nothing, so an entry for it would only make the user
	 * press undo twice to skip past it and would evict real history at the
	 * limit. Leaving the redo branch intact is correct too — the document did
	 * not diverge from the state those entries replay onto.
	 */
	run(op: EditOperation, doc: Document): void {
		const before = doc.cursor;
		if (!op.apply(doc)) {
			return;
		}
		const after = doc.cursor;
		const entry: HistoryEntry = {
			op,
			cursorBefore: { line: before.line, logical: before.logical },
			cursorAfter: { line: after.line, logical: after.logical },
			time: this._now(),
		};
		const top = this._undo[this._undo.length - 1];
		if (!(top && this._merge(top, entry))) {
			this._undo.push(entry);
			if (this._undo.length > this._limit) {
				this._undo.shift();
			}
		}
		this._redo.length = 0;
	}

	/**
	 * Fold `entry` into `top` when it continues the same edit: the newer
	 * cursor picks up where the older left off, the operation agrees to merge,
	 * and the gap is within the time window. Returns false when `entry` must
	 * start its own step. Mutating `top.op` only happens on success, since
	 * {@link EditOperation.merge} is a no-op when it returns false.
	 */
	private _merge(top: HistoryEntry, entry: HistoryEntry): boolean {
		if (entry.time - top.time >= this._mergeWindow) {
			return false;
		}
		if (
			entry.cursorBefore.line !== top.cursorAfter.line ||
			entry.cursorBefore.logical !== top.cursorAfter.logical
		) {
			return false;
		}
		if (!top.op.merge?.(entry.op)) {
			return false;
		}
		// The merged operation now spans both edits: its end cursor moves to
		// the newer entry's, and the timestamp advances so a pause after this
		// edit still ends the group.
		top.cursorAfter = entry.cursorAfter;
		top.time = entry.time;
		return true;
	}

	/** Undo the last edit; returns false when the undo stack is empty. */
	undo(doc: Document): boolean {
		const entry = this._undo.pop();
		if (!entry) {
			return false;
		}
		// invert() assumes the cursor sits where apply() left it — restore
		// cursorAfter first, or a since-moved cursor makes it delete the wrong
		// span. cursorBefore after the invert is the position the user expects.
		doc.setCursor(entry.cursorAfter.line, entry.cursorAfter.logical);
		entry.op.invert(doc);
		doc.setCursor(entry.cursorBefore.line, entry.cursorBefore.logical);
		this._redo.push(entry);
		return true;
	}

	/** Redo the last undone edit; returns false when the redo stack is empty. */
	redo(doc: Document): boolean {
		const entry = this._redo.pop();
		if (!entry) {
			return false;
		}
		// apply() runs against the pre-edit document, so restore cursorBefore
		// first; apply() then reproduces cursorAfter on its own.
		doc.setCursor(entry.cursorBefore.line, entry.cursorBefore.logical);
		entry.op.apply(doc);
		doc.setCursor(entry.cursorAfter.line, entry.cursorAfter.logical);
		this._undo.push(entry);
		return true;
	}

	/**
	 * Drop all history. Required after replacing the document wholesale
	 * (`Document.setText`), since the recorded positions then refer to a
	 * different text.
	 */
	clear(): void {
		this._undo.length = 0;
		this._redo.length = 0;
	}
}
