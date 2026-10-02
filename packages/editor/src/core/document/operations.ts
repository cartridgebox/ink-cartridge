import type { Document } from "./document.js";

/**
 * Atomic edit operations, each implementing `apply` + `invert`.
 *
 * `invert` is the symmetric counterpart: executing it right after `apply`
 * restores the document. Undo (P1) replays `invert` in reverse order, so no
 * document snapshots are needed. The convention is that `invert` runs while
 * the cursor is at the position `apply` left it at — history will restore the
 * cursor before inverting.
 */

export type EditOperation = {
	/**
	 * Apply the edit in place. Returns false when the edit was a no-op (the
	 * document is unchanged), so history can skip recording a dead step.
	 */
	apply(doc: Document): boolean;
	invert(doc: Document): void;
	/**
	 * Absorb a following edit into this one so the two share a single undo
	 * step (e.g. two adjacent insertions form one typed run). Returns true
	 * after folding `next` in, or false when the edit kind differs and they
	 * must stay separate. History calls this only for edits whose cursors are
	 * adjacent and within its merge window, so contiguity can be assumed.
	 */
	merge?(next: EditOperation): boolean;
};

/** Insert a string at the cursor; invert deletes exactly the inserted text. */
export class InsertTextOp implements EditOperation {
	constructor(private text: string) {}

	apply(doc: Document): boolean {
		const { line, logical } = doc.cursor;
		const cur = doc.getLine(line);
		doc.setLine(line, cur.slice(0, logical) + this.text + cur.slice(logical));
		doc.setCursor(line, logical + this.text.length);
		return true;
	}

	invert(doc: Document): void {
		const { line, logical } = doc.cursor;
		const cur = doc.getLine(line);
		const start = logical - this.text.length;
		doc.setLine(line, cur.slice(0, start) + cur.slice(logical));
		doc.setCursor(line, start);
	}

	/** Merge only with another insertion; anything else ends the typed run. */
	merge(next: EditOperation): boolean {
		if (!(next instanceof InsertTextOp)) {
			return false;
		}
		this.text += next.text;
		return true;
	}
}

/** Backspace: delete the char before the cursor, or join with the previous line at column 0. */
export class DeleteBeforeOp implements EditOperation {
	private _deletedChar = "";
	private _joined = false;

	apply(doc: Document): boolean {
		const { line, logical } = doc.cursor;
		if (logical > 0) {
			const cur = doc.getLine(line);
			// Deleting only the trailing half of a surrogate pair would leave a
			// broken half-rendering char, so delete the whole code point.
			const last = cur.charCodeAt(logical - 1);
			const isTrail = last >= 0xdc00 && last <= 0xdfff && logical >= 2;
			const units = isTrail ? 2 : 1;
			this._deletedChar = cur.slice(logical - units, logical);
			this._joined = false;
			doc.setLine(line, cur.slice(0, logical - units) + cur.slice(logical));
			doc.setCursor(line, logical - units);
			return true;
		} else if (line > 0) {
			const prev = doc.getLine(line - 1);
			const cur = doc.getLine(line);
			doc.setLine(line - 1, prev + cur);
			doc.removeLineAt(line);
			doc.setCursor(line - 1, prev.length);
			this._joined = true;
			return true;
		}
		return false;
	}

	invert(doc: Document): void {
		if (!this._joined) {
			const { line, logical } = doc.cursor;
			const cur = doc.getLine(line);
			doc.setLine(
				line,
				cur.slice(0, logical) + this._deletedChar + cur.slice(logical)
			);
			doc.setCursor(line, logical + this._deletedChar.length);
		} else {
			// Cursor sits at the end of the merged line; split it back at that point.
			const { line, logical } = doc.cursor;
			const cur = doc.getLine(line);
			doc.setLine(line, cur.slice(0, logical));
			doc.insertLineAt(line + 1, cur.slice(logical));
			doc.setCursor(line + 1, 0);
		}
	}
}

/** Delete key: remove the char after the cursor, or join with the next line at end of line. */
export class DeleteAfterOp implements EditOperation {
	private _deletedChar = "";
	private _joined = false;

	apply(doc: Document): boolean {
		const { line, logical } = doc.cursor;
		const cur = doc.getLine(line);
		if (logical < cur.length) {
			// Deleting only the leading half of a surrogate pair would leave a
			// broken half-rendering char, so delete the whole code point.
			const first = cur.charCodeAt(logical);
			const isLead = first >= 0xd800 && first <= 0xdbff && logical + 1 < cur.length;
			const units = isLead ? 2 : 1;
			this._deletedChar = cur.slice(logical, logical + units);
			this._joined = false;
			doc.setLine(line, cur.slice(0, logical) + cur.slice(logical + units));
			return true;
		} else if (line < doc.lineCount - 1) {
			const next = doc.getLine(line + 1);
			doc.setLine(line, cur + next);
			doc.removeLineAt(line + 1);
			this._joined = true;
			return true;
		}
		return false;
	}

	invert(doc: Document): void {
		if (!this._joined) {
			const { line, logical } = doc.cursor;
			const cur = doc.getLine(line);
			doc.setLine(
				line,
				cur.slice(0, logical) + this._deletedChar + cur.slice(logical)
			);
		} else {
			const { line, logical } = doc.cursor;
			const cur = doc.getLine(line);
			doc.setLine(line, cur.slice(0, logical));
			doc.insertLineAt(line + 1, cur.slice(logical));
		}
	}
}

/** Enter: split the current line at the cursor; invert rejoins the two lines. */
export class SplitLineOp implements EditOperation {
	apply(doc: Document): boolean {
		const { line, logical } = doc.cursor;
		const cur = doc.getLine(line);
		doc.setLine(line, cur.slice(0, logical));
		doc.insertLineAt(line + 1, cur.slice(logical));
		doc.setCursor(line + 1, 0);
		return true;
	}

	invert(doc: Document): void {
		// Cursor is on the newly created line; the split point is its own start.
		const { line } = doc.cursor;
		const prev = doc.getLine(line - 1);
		const cur = doc.getLine(line);
		doc.setLine(line - 1, prev + cur);
		doc.removeLineAt(line);
		doc.setCursor(line - 1, prev.length);
	}
}

/**
 * Join the next line into the current one. `apply` never moves the cursor,
 * so `invert` cannot rely on the cursor position — it records the join point
 * (end of the original current line) instead.
 */
export class JoinLineOp implements EditOperation {
	private _joinAt = 0;
	private _joined = false;

	apply(doc: Document): boolean {
		this._joined = false;
		const { line } = doc.cursor;
		if (line >= doc.lineCount - 1) {
			return false;
		}
		const cur = doc.getLine(line);
		const next = doc.getLine(line + 1);
		this._joinAt = cur.length;
		this._joined = true;
		doc.setLine(line, cur + next);
		doc.removeLineAt(line + 1);
		return true;
	}

	invert(doc: Document): void {
		// apply() no-ops on the last line; inverting that split would corrupt
		// the document, so mirror the no-op.
		if (!this._joined) {
			return;
		}
		const { line } = doc.cursor;
		const cur = doc.getLine(line);
		doc.setLine(line, cur.slice(0, this._joinAt));
		doc.insertLineAt(line + 1, cur.slice(this._joinAt));
	}
}

/** Indent the current line by `indentWidth` spaces, moving the cursor along. */
export class IndentOp implements EditOperation {
	apply(doc: Document): boolean {
		const { line, logical } = doc.cursor;
		const cur = doc.getLine(line);
		const spaces = " ".repeat(doc.indentWidth);
		doc.setLine(line, spaces + cur);
		doc.setCursor(line, logical + doc.indentWidth);
		return true;
	}

	invert(doc: Document): void {
		const { line, logical } = doc.cursor;
		const cur = doc.getLine(line);
		doc.setLine(line, cur.slice(doc.indentWidth));
		doc.setCursor(line, Math.max(0, logical - doc.indentWidth));
	}
}

/** Outdent up to `indentWidth` leading spaces; invert re-adds exactly what was removed. */
export class OutdentOp implements EditOperation {
	private _removed = 0;

	apply(doc: Document): boolean {
		const { line, logical } = doc.cursor;
		const cur = doc.getLine(line);
		const leading = /^ */.exec(cur)?.[0].length ?? 0;
		const remove = Math.min(leading, doc.indentWidth);
		this._removed = remove;
		if (remove > 0) {
			doc.setLine(line, cur.slice(remove));
			doc.setCursor(line, Math.max(0, logical - remove));
			return true;
		}
		return false;
	}

	invert(doc: Document): void {
		if (this._removed === 0) {
			return;
		}
		const { line, logical } = doc.cursor;
		const cur = doc.getLine(line);
		doc.setLine(line, " ".repeat(this._removed) + cur);
		doc.setCursor(line, logical + this._removed);
	}
}
