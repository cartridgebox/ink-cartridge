import type { PipelineContext, ProcessorInput } from "../types/processor.js";
import type { ResolvedGlobalSequenceEntry } from "../types/entry.js";
import type { GlobalPendingSequence } from "../types/pending-sequence.js";
import { checkWhen } from "../checkWhen.js";

const DEFAULT_SEQUENCE_TIMEOUT = 500;

/**
 * Try to start a global pending sequence from a specific affectOverlay group.
 *
 * Iterates the candidate entries, filters by affectOverlay, category,
 * and cover/override constraints, and creates a pending sequence when
 * the first key matches.
 *
 * @param entries        Candidate global sequence entries.
 * @param affectOverlay  Which group to filter (true = layer phase, false = page phase).
 * @param ctx            Full pipeline context.
 * @returns true when a new pending sequence was started (event consumed).
 */
function tryStartGlobalSequence<TComponent>(
  entries: ResolvedGlobalSequenceEntry[],
  affectOverlay: boolean,
  ctx: PipelineContext<TComponent>,
): boolean {
  // First arm wins: while any global sequence is pending — in either
  // affectLayer phase — no new one may start over it. Starting one anyway
  // would overwrite the single `pendingSeqRef` slot, silently dropping the
  // armed sequence and leaving its timer to fire into nothing. The armed
  // sequence ends by completing, timing out, or being cancelled by the
  // usual mismatched-key rule.
  if (ctx.pendingSeqRef.current !== null) return false;

  // Collect all entries that pass every filter AND whose first key
  // matches the current event. When multiple entries share the same
  // first key, they are stored as candidates on the pending sequence
  // so that subsequent keys can disambiguate.
  const matching: ResolvedGlobalSequenceEntry[] = [];

  for (const entry of entries) {
    if ((entry.affectLayer ?? false) !== affectOverlay) continue;
    if (entry.mode && entry.mode !== ctx.currentMode) continue;

    if (!checkWhen(entry.when, ctx.conditions)) continue;

    if (
      affectOverlay &&
      ctx.allLayers.length === 0 &&
      !entry.executeWhenNoOverlay
    )
      continue;
    if (!ctx.topComponent) continue;

    const cat = entry.category;
    if (cat !== undefined && cat !== "*") {
      if (Array.isArray(cat) && cat.length === 0) continue;
      if (Array.isArray(cat) && !cat.includes(ctx.topComponent)) continue;
    }

    // Cover check: only boundSequence can override a global sequence.
    if (entry.cover !== false) {
      const firstKey = entry.keys[0];
      if (affectOverlay) {
        let anyOverlayHasOverride = false;
        for (const layerState of ctx.allLayers) {
          const keyboardLayer = ctx.layerKeyboardRefs.get(layerState.layerId);
          if (!keyboardLayer) continue;
          for (const elementId of layerState.activeElements) {
            const element = keyboardLayer.elementKeyboards.get(elementId);
            if (element?.sequences.has(firstKey)) {
              anyOverlayHasOverride = true;
              break;
            }
          }
          if (anyOverlayHasOverride) break;
        }
        if (anyOverlayHasOverride) continue;
      } else {
        if (ctx.topComponent) {
          const topLayer = ctx.layersRef.get(ctx.topComponent);
          if (topLayer?.sequences.has(firstKey)) continue;
        }
      }
    }

    if (ctx.eventNames.includes(entry.keys[0])) {
      matching.push(entry);
    }
  }

  if (matching.length === 0) return false;

  // Use the first matching entry as the initial pending state.
  // Candidates are stored for disambiguation when multiple non-exclusive
  // entries share the same first key — same logic as layer-level
  // boundSequence in layer-handler.ts.
  const selected = matching[0];
  const timeout = selected.timeout ?? DEFAULT_SEQUENCE_TIMEOUT;
  const candidates =
    selected.exclusive === true
      ? undefined
      : (() => {
          const nonExclusive = matching.filter((c) => c.exclusive !== true);
          return nonExclusive.length <= 1 ? undefined : nonExclusive;
        })();

  const pending: GlobalPendingSequence = {
    sequences: selected.keys,
    nextIndex: 1,
    handler: selected.operate,
    timer: undefined as unknown as ReturnType<typeof setTimeout>,
    timeout,
    exclusive: selected.exclusive ?? false,
    affectOverlay,
    cover: selected.cover ?? true,
    category: selected.category,
    executeWhenNoOverlay: selected.executeWhenNoOverlay,
    when: selected.when,
    candidates,
  };
  const timer = setTimeout(() => {
    if (ctx.pendingSeqRef.current === pending) {
      ctx.pendingSeqRef.current = null;
    }
    ctx.notifyPendingSyncs();
  }, timeout);
  pending.timer = timer;
  ctx.pendingSeqRef.current = pending;
  return true;
}

/**
 * Process the currently active global pending sequence.
 *
 * Matches the next expected key, handles exclusive vs non-exclusive
 * mismatch behaviour, and fires the handler when the full sequence
 * is completed.
 *
 * @param ctx  Full pipeline context.
 * @returns true when the event was consumed by the pending sequence.
 */
function processGlobalPending<TComponent>(
  ctx: PipelineContext<TComponent>,
  affectOverlay: boolean,
): boolean {
  const pending = ctx.pendingSeqRef.current;
  if (pending === null) return false;

  // Only process the pending sequence in the stage that matches its
  // affectOverlay group — otherwise a pending sequence started in
  // stage 6 (affectOverlay: false) would have its continuation
  // consumed by stage 2 (affectOverlay: true), bypassing the
  // layer broadcast.
  if (pending.affectOverlay !== affectOverlay) return false;

  if (
    pending.affectOverlay &&
    ctx.allLayers.length === 0 &&
    !pending.executeWhenNoOverlay
  ) {
    clearTimeout(pending.timer);
    ctx.pendingSeqRef.current = null;
    return false;
  }

  if (!checkWhen(pending.when, ctx.conditions)) {
    clearTimeout(pending.timer);
    ctx.pendingSeqRef.current = null;
    return false;
  }

  const expectedKey = pending.sequences[pending.nextIndex];
  if (ctx.eventNames.includes(expectedKey)) {
    clearTimeout(pending.timer);
    pending.nextIndex++;

    // Narrow candidates to only those whose next key also matches.
    // Same pattern as layer-handler.ts.
    if (pending.candidates && pending.candidates.length > 1) {
      const nextIdx = pending.nextIndex - 1;
      const narrowed = pending.candidates.filter(
        (c) =>
          c.keys.length > nextIdx && ctx.eventNames.includes(c.keys[nextIdx]),
      );
      pending.candidates = narrowed.length <= 1 ? undefined : narrowed;
    }

    if (pending.nextIndex === pending.sequences.length) {
      pending.handler();
      ctx.pendingSeqRef.current = null;
    } else {
      pending.timer = setTimeout(() => {
        if (ctx.pendingSeqRef.current === pending) {
          ctx.pendingSeqRef.current = null;
        }
        ctx.notifyPendingSyncs();
      }, pending.timeout);
    }
    return true;
  }

  if (pending.exclusive) {
    // Exclusive mode: silently consume the mismatched key, keep waiting.
    return true;
  }

  if (pending.candidates && pending.candidates.length > 1) {
    // Non-exclusive with multiple candidates: try the current key
    // against every candidate's next expected key to disambiguate.
    // Same pattern as layer-handler.ts.
    const nextIdx = pending.nextIndex;
    const stillPossible = pending.candidates.filter(
      (c) =>
        c.keys.length > nextIdx && ctx.eventNames.includes(c.keys[nextIdx]),
    );
    if (stillPossible.length === 0) {
      // No candidate matches — cancel all and let the key fall through.
      clearTimeout(pending.timer);
      ctx.pendingSeqRef.current = null;
      return false;
    }
    // One or more candidates match — lock in the first match and
    // restart the sequence from it. The current key is consumed as
    // the next key of the chosen candidate.
    const chosen = stillPossible[0];
    clearTimeout(pending.timer);
    const timeout = chosen.timeout ?? DEFAULT_SEQUENCE_TIMEOUT;
    const newPending: GlobalPendingSequence = {
      sequences: chosen.keys,
      nextIndex: nextIdx + 1,
      handler: chosen.operate,
      timer: undefined as unknown as ReturnType<typeof setTimeout>,
      timeout,
      exclusive: chosen.exclusive ?? false,
      affectOverlay: pending.affectOverlay,
      cover: chosen.cover ?? true,
      category: chosen.category,
      executeWhenNoOverlay: chosen.executeWhenNoOverlay,
      when: chosen.when,
      candidates: stillPossible.length === 1 ? undefined : stillPossible,
    };
    if (newPending.nextIndex === newPending.sequences.length) {
      // Full sequence matched — fire handler.
      chosen.operate();
      ctx.pendingSeqRef.current = null;
    } else {
      // Still waiting for more keys — restart the timeout.
      newPending.timer = setTimeout(() => {
        if (ctx.pendingSeqRef.current === newPending) {
          ctx.pendingSeqRef.current = null;
        }
        ctx.notifyPendingSyncs();
      }, timeout);
      ctx.pendingSeqRef.current = newPending;
    }
    return true;
  }

  // No candidates (single binding): cancel and let the key fall through.
  clearTimeout(pending.timer);
  ctx.pendingSeqRef.current = null;
  return false;
}

/**
 * Create a processor for global multi-key sequences.
 *
 * Handles two sub-steps in order:
 * 1. Drain any active global pending sequence.
 * 2. Try to start a new sequence from registered entries.
 *
 * Manages pending-sequence state, timeout resets, sequence
 * disambiguation between entries sharing a first key, and `exclusive`
 * mode key consumption. Entries are matched against the phase via their
 * `affectLayer` field.
 *
 * @param config.affectOverlay - Which priority group this processor serves.
 * @returns A {@link ProcessorInput} for the global sequence stage, to be
 *          registered with {@link KeyboardEngine.addProcessor}.
 */
export function createGlobalSequenceProcessor<TComponent>(config: {
  affectOverlay: boolean;
}): ProcessorInput<TComponent> {
  const { affectOverlay } = config;
  return {
    active: true,
    process(ctx: PipelineContext<TComponent>): boolean {
      if (processGlobalPending(ctx, affectOverlay)) return true;
      if (tryStartGlobalSequence(ctx.globalSequences, affectOverlay, ctx))
        return true;
      return false;
    },
    id: `global-sequence-${affectOverlay ? "overlay" : "screen"}`,
  };
}
