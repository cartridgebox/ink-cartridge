import type { PipelineContext, ProcessorInput } from "../types/processor.js";
import {
  collectElementFocusTargets,
  handlerElementBindings,
  handlerElementPriority,
} from "../elementParser.js";
import { ElementKeyboard } from "../types/page-layer.js";
import { keyMatchesRule } from "../layerHandler.js";

function isLayerStopped<TC>(
  ctx: PipelineContext<TC>,
  activeElements: { keyboard: ElementKeyboard }[],
): boolean {
  return ctx.eventNames.some((name) =>
    activeElements.some(({ keyboard }) => {
      const targets = collectElementFocusTargets(keyboard);
      return (
        keyMatchesRule(name, keyboard.stoppedKeys, ctx.conditions) ||
        targets.some((t) => keyMatchesRule(name, t.stoppedKeys, ctx.conditions))
      );
    }),
  );
}

/**
 * Create a processor for the layer stage.
 *
 * Layers are processed from the highest z-index to the lowest. Within one
 * layer the event is handled in two passes: priority handlers (auto-tab,
 * wildcard fallback, multi-key sequences) are offered to every active element
 * first, then ordinary bindings are broadcast to every element. A sequence
 * consumed in the first pass therefore preempts a sibling's plain binding
 * regardless of element order. The first element that handles the event marks
 * the layer as consumed, but the ordinary pass still reaches the remaining
 * elements so multiple handlers can run.
 *
 * If no element in the layer handled the event, the event bubbles to the
 * next lower layer. When no layer is left, the processor returns `false`
 * and the event continues toward the screen/page stages.
 */
export function createLayerProcessor<TComponent>(): ProcessorInput<TComponent> {
  return {
    active: true,
    process(ctx: PipelineContext<TComponent>): boolean {
      // allLayers is sorted by z-index ascending, so walk it in reverse.
      for (let i = ctx.allLayers.length - 1; i >= 0; i--) {
        const layerState = ctx.allLayers[i];
        const keyboardLayer = ctx.layerKeyboardRefs.get(layerState.layerId);
        if (!keyboardLayer) continue;

        const activeElements = layerState.activeElements
          .map((id) => ({
            id,
            keyboard: keyboardLayer.elementKeyboards.get(id),
          }))
          .filter(
            (
              entry,
            ): entry is {
              id: string;
              keyboard: ElementKeyboard;
            } => entry.keyboard !== undefined,
          );
        if (activeElements.length === 0) continue;

        const penetrated = ctx.eventNames.filter((name) =>
          activeElements.some(({ keyboard }) => {
            const targets = collectElementFocusTargets(keyboard);
            return (
              keyMatchesRule(name, keyboard.penetrationKeys, ctx.conditions) ||
              targets.some((t) =>
                keyMatchesRule(name, t.penetrationKeys, ctx.conditions),
              )
            );
          }),
        );
        const available = ctx.eventNames.filter(
          (name) => !penetrated.includes(name),
        );
        const stopped = isLayerStopped(ctx, activeElements);
        if (available.length === 0) {
          if (stopped) return true;
          continue;
        }

        let handled = false;
        // Priority handlers (auto-tab, wildcard, sequences) see the key before
        // any element's ordinary bindings, so a sequence owned by one element
        // cannot be preempted by a sibling's plain binding.
        for (const { id, keyboard } of activeElements) {
          const result = handlerElementPriority(
            ctx,
            id,
            keyboard,
            keyboardLayer,
            true,
            available,
          );
          if (result === "sequence") return true;
          if (result) handled = true;
        }
        for (const { keyboard } of activeElements) {
          if (handlerElementBindings(ctx, keyboard, available)) handled = true;
        }
        if (handled) return true;
        if (stopped) return true;
      }

      return false;
    },
    id: "layer",
  };
}
