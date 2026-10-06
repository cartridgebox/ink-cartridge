/**
 * Filters SGR mouse reports out of Ink's keyboard stream.
 *
 * Ink strips the ESC prefix from unknown escape sequences before handing
 * them to `useInput` callbacks, so a mouse report `\x1b[<0;20;5M` arrives
 * as `[<0;20;5M` — the `[<` marker survives. The Mouse instance has already
 * parsed the report; swallowing it here keeps it from reaching the keyboard
 * pipeline and being treated as typed text.
 *
 * Ink itself reassembles split escape sequences, but only for 20 ms
 * (`pendingInputFlushDelayMilliseconds` in Ink's App) — after that it flushes
 * the fragment as input. The small buffer below bridges that gap. A partial
 * buffer is only kept while it could still become a report: input that cannot
 * is released, because swallowing it would eat the keystrokes that follow.
 */
export class MouseReportFilter {
	private _buffer = "";

	/** `[<` plus up to three `;`-separated numeric fields, still incomplete. */
	private static readonly REPORT_PREFIX = /^\[<\d{0,4}(;\d{0,4}){0,2}$/;

	/**
	 * @param input - The string Ink passed to `useInput` (ESC already stripped).
	 * @returns `true` when the input is part of a mouse report and must be
	 *          swallowed; `false` when it is normal keyboard input.
	 */
	consume(input: string): boolean {
		if (this._buffer === "" && !input.startsWith("[<")) {
			return false;
		}

		const next = this._buffer + input;
		// A report ends with `M` (press/move) or `m` (release).
		if (/[Mm]$/.test(next)) {
			this._buffer = "";
			return true;
		}

		// Not a report after all — pasted text starting with `[<`, or a flushed
		// fragment followed by real typing. Drop the fragment and let this input
		// through; a mismatched tail is not something a report can still absorb.
		if (!MouseReportFilter.REPORT_PREFIX.test(next)) {
			this._buffer = "";
			return false;
		}

		this._buffer = next;
		return true;
	}
}
