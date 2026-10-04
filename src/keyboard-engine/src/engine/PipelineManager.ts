import { createModalProcessor } from "../processors/modal.js";
import { createCompositionProcessor } from "../processors/globalComposition.js";
import { createGlobalSequenceProcessor } from "../processors/globalSequence.js";
import { createGlobalKeyProcessor } from "../processors/globalKey.js";
import { createLayerProcessor } from "../processors/layer.js";
import { createScreenStackProcessor } from "../processors/screenStack.js";
import EngineState from "./EngineState.js";
import {
  KeyboardProcessorProps,
  PipelineProcessor,
  ProcessorInput,
} from "../types/processor.js";
import { builtinProcessorWeights } from "../processors/weights.js";

/**
 * Owns the processor pipeline for an engine instance: default 9-stage
 * construction, insertion, removal, reset, and kick/activate toggles.
 *
 * The default pipeline is a 9-stage chain (highest priority first):
 * `modal` → `composition-overlay` → `global-sequence-overlay` →
 * `global-key-overlay` → `layer` → `composition-screen` →
 * `global-sequence-screen` → `global-key-screen` → `screen-stack`.
 *
 * Custom processors can be injected at any position via
 * {@link addProcessor} (or the constructor's `processors` prop), and any
 * processor can be temporarily disabled via {@link kickProcessor}.
 * All pipeline state is **per-instance** — each `KeyboardEngine` manages
 * its own pipeline independently.
 *
 * Two caches mirror the stage list so id lookups and introspection stay
 * cheap: `processorIndex` maps each processor id to its processor and the
 * stage holding it (O(1) instead of a scan), and `flatSnapshot` holds a
 * lazily built flatten of the stages for {@link getProcessors}. Both are
 * dropped on any structural change — add, remove, re-weight, or reset —
 * while `active` toggles leave the pipeline shape untouched and keep them.
 */
export default class PipelineManager<TComponent> {
  private processorIndex = new Map<
    string,
    {
      processor: PipelineProcessor<TComponent>;
      stage: PipelineProcessor<TComponent>[];
    }
  >();

  private flatSnapshot: readonly PipelineProcessor<TComponent>[] | null = null;

  constructor(
    private state: EngineState<TComponent>,
    custom?: KeyboardProcessorProps<TComponent>[],
  ) {
    this.state._processors = this._buildDefaultProcessors(custom);
  }

  /**
   * Build the default 9-stage pipeline, in order:
   * `modal` (modal barrier) → `composition-overlay` (composition chains,
   * affectOverlay: true) → `global-sequence-overlay` (global sequences,
   * affectLayer: true) → `global-key-overlay` (global keys,
   * affectLayer: true) → `layer` (layer broadcast) →
   * `composition-screen` (composition chains, affectOverlay: false) →
   * `global-sequence-screen` (global sequences, affectLayer: false) →
   * `global-key-screen` (global keys, affectLayer: false) → `screen-stack`
   * (screen stack, top to bottom).
   *
   * Every built-in is registered through {@link addProcessor} with its own
   * weight from {@link builtinProcessorWeights}, so each lands in a stage of
   * its own and the stage list ends up sorted. `custom` processors (the
   * constructor's `processors` prop) are applied afterwards through the same
   * path, using their `index` / `target` + `position`, or appended when
   * neither is given.
   */
  _buildDefaultProcessors(
    custom?: KeyboardProcessorProps<TComponent>[],
  ): PipelineProcessor<TComponent>[][] {
    this.state._processors = [];
    this.processorIndex.clear();
    this.flatSnapshot = null;

    this.addProcessor(createModalProcessor(), {
      weight: builtinProcessorWeights.modal,
    });
    this.addProcessor(createCompositionProcessor({ affectOverlay: true }), {
      weight: builtinProcessorWeights["composition-overlay"],
    });
    this.addProcessor(createGlobalSequenceProcessor({ affectOverlay: true }), {
      weight: builtinProcessorWeights["global-sequence-overlay"],
    });
    this.addProcessor(createGlobalKeyProcessor({ affectOverlay: true }), {
      weight: builtinProcessorWeights["global-key-overlay"],
    });
    this.addProcessor(createLayerProcessor(), {
      weight: builtinProcessorWeights.layer,
    });
    this.addProcessor(createCompositionProcessor({ affectOverlay: false }), {
      weight: builtinProcessorWeights["composition-screen"],
    });
    this.addProcessor(createGlobalSequenceProcessor({ affectOverlay: false }), {
      weight: builtinProcessorWeights["global-sequence-screen"],
    });
    this.addProcessor(createGlobalKeyProcessor({ affectOverlay: false }), {
      weight: builtinProcessorWeights["global-key-screen"],
    });
    this.addProcessor(createScreenStackProcessor(), {
      weight: builtinProcessorWeights["screen-stack"],
    });

    for (const entry of custom ?? []) {
      if (entry.index !== undefined) {
        this.addProcessor(entry.processor, { index: entry.index });
      } else if (entry.target && entry.position) {
        this.addProcessor(
          entry.processor,
          entry.position === "before"
            ? { before: entry.target }
            : { after: entry.target },
        );
      } else {
        this.addProcessor(entry.processor);
      }
    }

    return this.state._processors;
  }

  /**
   * Insert a custom processor into this engine instance's pipeline.
   *
   * The pipeline is a list of stages kept sorted by weight — higher weight
   * runs first. Processors sharing a weight form one stage and run in
   * insertion order within it.
   *
   * Priority is expressed through `options`:
   * - `{ weight: n }` — explicit priority, higher runs first
   * - `{ index: n }` — insert as a new stage at that 0-based stage slot
   *   (`0` to the stage count, the latter being the append slot)
   * - `{ before: "id" }` / `{ after: "id" }` — insert as a new stage just
   *   before/after the stage holding the named processor (e.g. `"modal"`,
   *   `"layer"`)
   * - omitted — weight `0`, i.e. after all built-in stages
   *
   * The insertion takes effect immediately — the next {@link processKey}
   * call uses the updated pipeline. A processor whose `process(ctx)`
   * returns `true` consumes the event and stops the chain; `false` lets
   * it continue to the next stage.
   *
   * @example
   * ```ts
   * // Logging — insert at front to trace every keystroke
   * engine.addProcessor({
   *   id: 'keystroke-logger',
   *   process(ctx) {
   *     console.log(`[key] input=${ctx.input} names=${ctx.eventNames}`);
   *     return false; // don't consume
   *   },
   * }, { index: 0 });
   *
   * // Intercept before the modal barrier
   * engine.addProcessor({
   *   id: 'emergency-exit',
   *   process(ctx) {
   *     if (ctx.input === '\x03') { process.exit(0); return true; }
   *     return false;
   *   },
   * }, { before: 'modal' });
   *
   * // Run after the layer broadcast stage
   * engine.addProcessor(myAuditProcessor, { after: 'layer' });
   * ```
   *
   * @returns `true` if the processor was registered; `false` if
   *          `processor.id` duplicates an existing id or the `before`/`after`
   *          target is not found.
   * @throws If `index` is not an integer within the valid stage range — an
   *         out-of-range index is a caller bug, not a duplicate-id race, so it
   *         still throws.
   */
  addProcessor(
    processor: ProcessorInput<TComponent>,
    options?:
      | { weight?: number }
      | { before?: string }
      | { after?: string }
      | { index?: number },
  ): boolean {
    if (this.processorIndex.has(processor.id)) {
      return false;
    }

    const opts = options ?? {};
    let targetIndex: number | undefined;

    if ("index" in opts && typeof opts.index === "number") {
      const stageCount = this.state._processors.length;
      if (
        !Number.isInteger(opts.index) ||
        opts.index < 0 ||
        opts.index > stageCount
      ) {
        throw new Error(
          `[ink-cartridge] Cannot insert processor "${processor.id}" at index ${opts.index}: expected an integer in [0, ${stageCount}]`,
        );
      }
      targetIndex = opts.index;
    } else {
      const target =
        "before" in opts
          ? opts.before
          : "after" in opts
            ? opts.after
            : undefined;
      if (target) {
        const kind = "before" in opts ? "before" : "after";

        // Positions are stage slots: a named target resolves to the stage
        // holding it, and the new processor becomes a stage of its own
        // beside that one — so "before modal" still runs strictly ahead of
        // the modal barrier and can consume the event.
        const targetEntry = this.processorIndex.get(target);
        const stageIndex = targetEntry
          ? this.state._processors.indexOf(targetEntry.stage)
          : -1;

        if (stageIndex === -1) {
          return false;
        }
        targetIndex = kind === "before" ? stageIndex : stageIndex + 1;
      }
    }

    // Priority: explicit `weight`, else the positional sugar resolves to the
    // weight of the stage slot it occupies, else the default 0 (after
    // built-ins).
    let weight: number;
    if ("weight" in opts && typeof opts.weight === "number") {
      weight = opts.weight;
    } else if (targetIndex !== undefined) {
      weight = this._weightForSlot(this.state._processors, targetIndex);
    } else {
      weight = 0;
    }

    const full: PipelineProcessor<TComponent> = {
      process: processor.process,
      id: processor.id,
      active: processor.active ?? true,
      weight,
    };

    const sameWeight = this.state._processors.find(
      (each) => each[0].weight === weight,
    );

    let targetStage: PipelineProcessor<TComponent>[] = [];
    if (sameWeight) {
      sameWeight.push(full);
      targetStage = sameWeight;
    } else {
      targetStage = [full];
      this.state._processors.push(targetStage);
      this._sortByWeight();
    }

    this.processorIndex.set(processor.id, {
      processor: full,
      stage: targetStage,
    });
    this.flatSnapshot = null;
    return true;
  }

  /**
   * Compute a weight that sorts a new processor as its own stage at `slot`,
   * bisecting the weights of the stages surrounding that slot so the sorted
   * order is preserved without disturbing existing stages.
   *
   * @param arr - The stage list, already sorted by weight (descending).
   * @param slot - Target 0-based stage slot.
   */
  private _weightForSlot(
    arr: PipelineProcessor<TComponent>[][],
    slot: number,
  ): number {
    const weightOf = (p?: PipelineProcessor<TComponent>[]) =>
      p === undefined ? undefined : p[0].weight;

    const above = slot > 0 ? weightOf(arr[slot - 1]) : undefined;
    const below = slot < arr.length ? weightOf(arr[slot]) : undefined;

    if (above !== undefined && below !== undefined) {
      return above > below ? below + (above - below) / 2 : above;
    }
    if (below !== undefined) {
      return below + 1000; // insert at the very front
    }
    if (above !== undefined) {
      return above - 1000; // insert at the very end
    }
    return 0;
  }

  /**
   * Re-sort the stages by weight (descending). Stages always carry distinct
   * weights, so there is no tie to break.
   */
  private _sortByWeight(): void {
    this.state._processors.sort((a, b) => b[0].weight - a[0].weight);
  }

  /**
   * Remove a processor from this instance's pipeline by its id.
   *
   * Works on both custom processors (added via {@link addProcessor} or the
   * constructor's `processors` option) and built-in processors. Removing a
   * built-in processor alters keyboard behavior — for example, removing
   * `"modal"` disables the modal barrier entirely. The engine keeps
   * functioning normally (no error is thrown), but that pipeline stage is
   * gone; call {@link resetProcessors} to restore the defaults.
   *
   * The removal is immediate — the next {@link processKey} call uses the
   * updated pipeline — and the removed id can be reused immediately by
   * {@link addProcessor}.
   *
   * @param processorId - The `id` of the processor to remove.
   * @returns `true` if the processor was found and removed, `false` if no
   *          processor with the given id exists.
   */
  removeProcessor(processorId: string): boolean {
    const entry = this.processorIndex.get(processorId);
    if (!entry) {
      return false;
    }

    const stage = entry.stage;
    const indexInStage = stage.indexOf(entry.processor);
    if (indexInStage !== -1) {
      stage.splice(indexInStage, 1);
    }
    // A stage is defined by its weight; with no member left it has none.
    if (stage.length === 0) {
      const stageIndex = this.state._processors.indexOf(stage);
      if (stageIndex !== -1) {
        this.state._processors.splice(stageIndex, 1);
      }
    }

    this.processorIndex.delete(processorId);
    this.flatSnapshot = null;
    return true;
  }

  /**
   * Return a read-only snapshot of the current processor pipeline.
   *
   * Useful for debugging and introspection. Stages are flattened into
   * processing order, and the result is a new array — adding to or removing
   * from it does not affect the pipeline, though it holds the same processor
   * objects. It includes inactive processors, which are never removed from
   * the pipeline by kick/activate toggles.
   *
   * The flattened order is cached and rebuilt only when the pipeline's
   * structure changes (add/remove/re-weight/reset), so repeated calls are
   * cheap; each call still returns a fresh copy of the cached array.
   */
  getProcessors(): readonly PipelineProcessor<TComponent>[] {
    if (this.flatSnapshot === null) {
      this.flatSnapshot = this.state._processors.flat();
    }
    // Hand out a fresh array per call so callers can't mutate the cache;
    // the elements are shared, so `active` toggles stay visible either way.
    return [...this.flatSnapshot];
  }

  /**
   * Restore the processor pipeline to the default 9-stage chain.
   *
   * Removes all custom processors — any processor state they held is lost.
   * The built-in processors are rebuilt fresh with `active: true`, so any
   * kick/activate state is cleared by a reset.
   */
  resetProcessors(): void {
    this.state._processors = this._buildDefaultProcessors();
  }

  /**
   * Re-enable a processor by flipping its `active` flag back on. The
   * processor resumes normal operation on the next {@link processKey}
   * call.
   *
   * Neither this method nor {@link kickProcessor} changes the pipeline
   * array — {@link getProcessors} returns the same list regardless of
   * kick/activate state. Only structural operations — {@link addProcessor},
   * {@link removeProcessor}, {@link setProcessorWeight}, and
   * {@link resetProcessors} — alter the pipeline.
   *
   * @param id - The processor id to re-enable (built-in or custom).
   * @returns `true` if the processor was re-activated, `false` if it was
   *          already active or no processor with that id exists.
   */
  activeProcessor(id: string): boolean {
    const target = this.processorIndex.get(id)?.processor;
    if (!target || target.active) {
      return false;
    }
    target.active = true;
    return true;
  }

  /**
   * Disable a processor at runtime without removing it from the pipeline
   * by flipping its `active` flag off.
   *
   * The processor is skipped on the next {@link processKey} call — it is
   * excluded before `process()` runs, so the rest of its stage and every
   * later stage run as if the disabled processor did not exist.
   * Works on both built-in stages and custom processors added via
   * {@link addProcessor}.
   *
   * @param id - The processor id to disable (built-in or custom).
   * @returns `true` if the processor was kicked, `false` if it was
   *          already inactive or no processor with that id exists.
   */
  kickProcessor(id: string): boolean {
    const target = this.processorIndex.get(id)?.processor;
    if (!target || !target.active) {
      return false;
    }
    target.active = false;
    return true;
  }

  /**
   * Reassign a processor's priority weight at runtime, letting applications
   * reorder stages without removing and re-adding them.
   *
   * Processors sharing a weight form one stage, and the stage list stays
   * sorted by that shared weight, so repositioning the processor means
   * relocating it between stages: it joins the stage that already carries
   * the target weight, or opens a fresh stage of its own when no stage
   * matches. Either way it is detached from its old stage first, and an old
   * stage left empty is dropped. The `active` flag is untouched.
   *
   * Works on both built-in stages and custom processors. Use
   * {@link builtinProcessorWeights} as a reference when computing a target
   * weight (e.g. `builtinProcessorWeights.modal - 1` to run just after the
   * modal barrier).
   *
   * @param id - The processor id to re-weight (built-in or custom).
   * @param weight - The new weight.
   * @returns `true` if the processor was found, `false` if no processor with
   *          that id exists.
   */
  setProcessorWeight(id: string, weight: number): boolean {
    const entry = this.processorIndex.get(id);
    if (!entry) {
      return false;
    }

    const target = entry.processor;
    if (target.weight === weight) {
      return true;
    }

    const stage = entry.stage;
    const indexInStage = stage.indexOf(target);

    // Detach before locating the target stage: dropping an emptied stage
    // shifts the indices of every stage after it.
    if (indexInStage !== -1) {
      stage.splice(indexInStage, 1);
    }
    if (stage.length === 0) {
      const stageIndex = this.state._processors.indexOf(stage);
      if (stageIndex !== -1) {
        this.state._processors.splice(stageIndex, 1);
      }
    }
    target.weight = weight;

    const sameWeight = this.state._processors.find(
      (each) => each[0].weight === weight,
    );
    if (sameWeight) {
      sameWeight.push(target);
      entry.stage = sameWeight;
    } else {
      const newStage = [target];
      this.state._processors.push(newStage);
      this._sortByWeight();
      entry.stage = newStage;
    }

    this.flatSnapshot = null;
    return true;
  }
}
