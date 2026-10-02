import { Document } from "./document/document.js";
import { History } from "./document/history.js";
import {
	DeleteAfterOp,
	DeleteBeforeOp,
	type EditOperation,
	IndentOp,
	InsertTextOp,
	JoinLineOp,
	OutdentOp,
	SplitLineOp,
} from "./document/operations.js";

export type EditorOptions = {
	indentWidth?: number;
};

export type EditorCommandArgs = Record<string, unknown> | undefined;

/**
 * A command handler. Returning an {@link EditOperation} makes the command
 * undoable — `execute` routes the operation through the {@link History},
 * which applies it and records the cursor positions around it. Returning
 * nothing marks a command that mutates the document directly or only moves
 * the cursor; neither is recorded.
 */
export type EditorCommandHandler = (
	doc: Document,
	args: EditorCommandArgs,
) => EditOperation | void;

type ChangeListener = () => void;

/**
 * Coordinator between the pure core and the keymap/render layers.
 *
 * Owns the document, a command registry (so P2 vim mode only swaps key
 * bindings, never touching the core), the change-notification channel the
 * view subscribes to, and the undo/redo {@link History}. Editing commands
 * return an atomic operation carrying its own `invert`, which `execute`
 * routes through the history; movement commands return nothing.
 */
export class EditorController {
	private readonly _document: Document;
	private readonly _commands = new Map<string, EditorCommandHandler>();
	private readonly _listeners = new Set<ChangeListener>();
	private readonly _history = new History();

	constructor(text: string, options: EditorOptions = {}) {
		this._document = new Document(text, { indentWidth: options.indentWidth });
		this._registerBuiltins();
	}

	get document(): Document {
		return this._document;
	}

	get history(): History {
		return this._history;
	}

	onChange(listener: ChangeListener): () => void {
		this._listeners.add(listener);
		return () => {
			this._listeners.delete(listener);
		};
	}

	defineCommand(id: string, handler: EditorCommandHandler): this {
		this._commands.set(id, handler);
		return this;
	}

	execute(id: string, args: EditorCommandArgs = undefined): void {
		const handler = this._commands.get(id);
		if (!handler) {
			throw new Error(`[ink-cartridge] Unknown editor command: ${id}`);
		}
		const op = handler(this._document, args);
		if (op) {
			this._history.run(op, this._document);
		}
		this._listeners.forEach((fn) => fn());
	}

	private _registerBuiltins(): void {
		// Editing commands return their operation instead of applying it:
		// `execute` hands it to the history, which applies it and records the
		// cursor positions around it (see History.run).
		this.defineCommand("editor.insertText", (_doc, args) => {
			const text = typeof args?.text === "string" ? args.text : "";
			return text ? new InsertTextOp(text) : undefined;
		});
		this.defineCommand("editor.deleteBefore", () => new DeleteBeforeOp());
		this.defineCommand("editor.deleteAfter", () => new DeleteAfterOp());
		this.defineCommand("editor.splitLine", () => new SplitLineOp());
		this.defineCommand("editor.joinLine", () => new JoinLineOp());
		this.defineCommand("editor.indent", () => new IndentOp());
		this.defineCommand("editor.outdent", () => new OutdentOp());

		// Undo/redo drive the history directly; they are not edits themselves,
		// so they return nothing and are never recorded.
		this.defineCommand("history.undo", () => {
			this._history.undo(this._document);
		});
		this.defineCommand("history.redo", () => {
			this._history.redo(this._document);
		});

		this.defineCommand("cursor.moveLeft", (doc) => doc.moveLeft());
		this.defineCommand("cursor.moveRight", (doc) => doc.moveRight());
		this.defineCommand("cursor.moveUp", (doc, args) => {
			const count = typeof args?.count === "number" ? args.count : 1;
			doc.moveUp(count);
		});
		this.defineCommand("cursor.moveDown", (doc, args) => {
			const count = typeof args?.count === "number" ? args.count : 1;
			doc.moveDown(count);
		});
		this.defineCommand("cursor.lineStart", (doc) => doc.moveToLineStart());
		this.defineCommand("cursor.lineEnd", (doc) => doc.moveToLineEnd());
		this.defineCommand("cursor.wordForward", (doc) => doc.moveWordForward());
		this.defineCommand("cursor.wordBackward", (doc) => doc.moveWordBackward());
		this.defineCommand("cursor.documentStart", (doc) => doc.moveToDocumentStart());
		this.defineCommand("cursor.documentEnd", (doc) => doc.moveToDocumentEnd());
		this.defineCommand("cursor.pageUp", (doc, args) => {
			const height = typeof args?.height === "number" ? args.height : 1;
			doc.movePageUp(height);
		});
		this.defineCommand("cursor.pageDown", (doc, args) => {
			const height = typeof args?.height === "number" ? args.height : 1;
			doc.movePageDown(height);
		});
		// Mouse click: position the cursor by logical column (soft-wrap aware).
		this.defineCommand("cursor.setPosition", (doc, args) => {
			const line = typeof args?.line === "number" ? args.line : doc.cursor.line;
			if (typeof args?.logical === "number") {
				doc.setCursor(line, args.logical);
			} else {
				const visual =
					typeof args?.visual === "number" ? args.visual : doc.cursor.visual;
				doc.setCursorAtVisual(line, visual);
			}
		});
		// Ctrl+wheel: scroll the view without moving the cursor (clamped).
		this.defineCommand("view.scroll", (doc, args) => {
			const delta = typeof args?.delta === "number" ? args.delta : 0;
			const height = typeof args?.height === "number" ? args.height : 1;
			doc.scrollView(delta, height);
		});
	}
}
