import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { EditorController, type EditorOptions } from "../editor-controller.js";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Transient status message shown in the information bar. */
export type SessionMessage = {
	/** Display text (already localized where applicable). */
	text: string;
	kind: "success" | "error";
};

type SessionListener = () => void;

/**
 * File-session coordinator shared by the editor, file tree, and toolbar.
 *
 * Owns the single open document (via an {@link EditorController}), the path
 * it was loaded from, and the saved-content hash used for the dirty check.
 * All file I/O happens here; components only call `open` / `save` and react
 * to `onChange`. The dirty check compares the current document text against
 * the hash of the last saved content (node `crypto` sha256), so a stray
 * formatting change never needs manual dirty bookkeeping.
 *
 * An instance is created per editor mount (see `Editor`) and passed to the
 * layer elements — the file tree, toolbar, and command bar all receive it
 * via props.
 */
export class EditorSession {
	private readonly _controller: EditorController;
	private _filePath: string | null = null;
	/** Hash of the content last written to `_filePath`; null while untitled. */
	private _savedHash: string | null = null;
	private _message: SessionMessage | null = null;
	private readonly _listeners = new Set<SessionListener>();

	constructor(initialText = "", options: EditorOptions = {}) {
		this._controller = new EditorController(initialText, options);
	}

	get controller(): EditorController {
		return this._controller;
	}

	/** Absolute path of the open file, or null for the untitled buffer. */
	get filePath(): string | null {
		return this._filePath;
	}

	/** File name for display; `[untitled]` when no file is open. */
	get displayName(): string {
		return this._filePath ? basename(this._filePath) : "[untitled]";
	}

	/** Last operation message (save result, open error), or null. */
	get message(): SessionMessage | null {
		return this._message;
	}

	/** True when the buffer differs from the saved content of its file. */
	isDirty(): boolean {
		if (this._filePath === null || this._savedHash === null) {
			return false;
		}
		return this.hash(this._controller.document.text) !== this._savedHash;
	}

	onChange(listener: SessionListener): () => void {
		this._listeners.add(listener);
		return () => {
			this._listeners.delete(listener);
		};
	}

	/**
	 * Load a file into the buffer, replacing the previous document. The
	 * buffer becomes clean (hash of the just-read content).
	 */
	open(filePath: string): ActionResult {
		let text: string;
		try {
			text = readFileSync(filePath, "utf8");
		} catch (err) {
			return this.fail(err);
		}
		// NUL bytes mark binary content — refuse it instead of rendering garbage.
		if (text.includes("\0")) {
			this._message = { text: "Binary file", kind: "error" };
			this._notify();
			return { ok: false, error: "Binary file" };
		}
		this._controller.document.setText(text);
		// Recorded positions refer to the previous text, so the history is
		// meaningless once the document is replaced.
		this._controller.history.clear();
		this._filePath = filePath;
		// Hash the NORMALIZED document text, not the raw disk bytes: the
		// document normalizes CRLF to LF, so hashing the raw text would
		// flag every CRLF file as dirty on open.
		this._savedHash = this.hash(this._controller.document.text);
		this._message = null;
		this._notify();
		return { ok: true };
	}

	/** Write the buffer to the open file, clearing the dirty state. */
	save(): ActionResult {
		if (this._filePath === null) {
			this._message = { text: "No file open", kind: "error" };
			this._notify();
			return { ok: false, error: "No file open" };
		}
		const text = this._controller.document.text;
		try {
			writeFileSync(this._filePath, text, "utf8");
		} catch (err) {
			return this.fail(err);
		}
		this._savedHash = this.hash(text);
		this._message = { text: "Saved", kind: "success" };
		this._notify();
		return { ok: true };
	}

	private hash(text: string): string {
		return createHash("sha256").update(text).digest("hex");
	}

	private fail(err: unknown): ActionResult {
		const error = err instanceof Error ? err.message : String(err);
		this._message = { text: error, kind: "error" };
		this._notify();
		return { ok: false, error };
	}

	private _notify(): void {
		this._listeners.forEach((fn) => fn());
	}
}
