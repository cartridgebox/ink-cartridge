import { KeyHandler, BaseSequenceBinding } from "./binding.js";
import { ResolvedGlobalSequenceEntry } from "./entry.js";
import { SequenceOptions } from "./options.js";

/**
 * Internal representation of a sequence that is currently being matched.
 *
 * Created when the first key of a registered `SequenceBinding` is pressed
 * and stored on the layer's `ScreenKeyboardLayer.pendingSequence`.
 * Tracked by a `timer` that cancels the pending state if the next key
 * does not arrive within `timeout` milliseconds.
 */
export interface PendingSequence {
  /** The full key sequence to match (copied from `SequenceBinding.keys`). */
  sequences: string[];
  /**
   * Index of the next key to match within `sequences`.
   * Starts at 1 after the first key is consumed.
   */
  nextIndex: number;
  /** Callback to invoke when the full sequence is matched. */
  handler: KeyHandler;
  /** The timeout timer handle; cleared on match, mismatch, or cancellation. */
  timer: NodeJS.Timeout;
  /** Timeout duration in milliseconds. */
  timeout: number;
  /** Options from the original `SequenceBinding`. */
  options?: SequenceOptions;
  /**
   * Page-only dormancy copied from the binding at start. A sequence started
   * while no layer was open must not continue after a layer appears.
   */
  stopsWorkingAfterLayerAppearing?: boolean;
  /**
   * Optional condition callback (copied from SequenceBinding at start).
   * Checked at each key press; if it returns `false`, the sequence is cancelled.
   */
  when?: (() => boolean) | string;
  /**
   * When multiple sequences share the same first key (non-exclusive
   * mode), stores all eligible {@link BaseSequenceBinding} candidates so
   * that subsequent keys can disambiguate. Set to `undefined` once
   * the pending sequence resolves to a single binding, or in exclusive
   * mode where only the first candidate is kept.
   */
  candidates?: BaseSequenceBinding[];
}

/**
 * Internal state for a global multi-key sequence that is currently being
 * matched across consecutive key presses.
 *
 * Created by the global sequence processor when the first key of a
 * registered {@link GlobalSequenceEntry} matches, and consumed when the
 * full sequence completes or times out.
 */
export interface GlobalPendingSequence {
  /** The full key sequence to match (copied from `GlobalSequenceEntry.keys`). */
  sequences: string[];
  /** Index of the next key to match within `sequences`. Starts at 1. */
  nextIndex: number;
  /** Callback to invoke when the full sequence is matched. */
  handler: () => void;
  /** The timeout timer handle; cleared on match, mismatch, or cancellation. */
  timer: ReturnType<typeof setTimeout>;
  /** Timeout duration in milliseconds between key presses. */
  timeout: number;
  /** When `true`, mismatched keys are silently consumed instead of cancelling the sequence. */
  exclusive: boolean;
  /** Whether the sequence runs in the overlay phase (`affectLayer: true`). */
  affectOverlay: boolean;
  /** Whether screen bindings may override this sequence. */
  cover: boolean;
  /** Whitelist of screen components allowed to use this sequence. */
  category?: unknown[] | "*";
  /** Whether the sequence fires even when no layer is open. */
  executeWhenNoOverlay?: boolean;
  /** Optional condition checked at each key press; the sequence is cancelled when it returns `false`. */
  when?: (() => boolean) | string;
  /**
   * When multiple global sequences share the same first key (non-exclusive
   * mode), stores all eligible {@link ResolvedGlobalSequenceEntry} candidates
   * so that subsequent keys can disambiguate. Set to `undefined` once the
   * pending sequence resolves to a single binding, or in exclusive mode
   * where only the first candidate is kept.
   */
  candidates?: ResolvedGlobalSequenceEntry[];
}
