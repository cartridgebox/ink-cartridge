import { checkWhen } from "../checkWhen.js";
import { handlerElement } from "../elementParser.js";
import { keyMatchesRule } from "../layerHandler.js";
import { BaseBoundKeyEntry } from "../types/binding.js";
import { defaultTargetsSymbol } from "../types/default-targets-symbol.js";
import { FocusTarget } from "../types/focus.js";
import { KeyRule } from "../types/key-rule.js";
import { ElementKeyboard } from "../types/page-layer.js";
import { PipelineContext, ProcessorInput } from "../types/processor.js";

function passAllowedKeys(
  allowedKeys: KeyRule[],
  blockedKeys: string[],
  eventNames: string[],
): boolean {
  return allowedKeys.some(
    (k) => !blockedKeys.includes(k.key) && eventNames.includes(k.key),
  );
}

function getFocusTarget(
  layer: ElementKeyboard,
  entry: { id: string; fromGroup: string | typeof defaultTargetsSymbol },
): FocusTarget | undefined {
  if (entry.fromGroup === defaultTargetsSymbol) {
    return layer.defaultTargets.get(entry.id);
  }
  return layer.focusTargets.get(entry.fromGroup)?.map.get(entry.id);
}

/** Keys a rule list currently disables — the rules whose `when` is false. */
function disabledKeys(
  rules: KeyRule[],
  conditions: Map<string, boolean>,
): string[] {
  return rules.filter((r) => !checkWhen(r.when, conditions)).map((r) => r.key);
}

function isAllowed(
  layer: ElementKeyboard,
  eventNames: string[],
  conditions: Map<string, boolean>,
): boolean {
  // Each allow-list is checked against the keys it disables itself: a
  // when-disabled rule vetoes its own scope only. Several focus targets can be
  // active at once, and one target disabling a key must not cancel another
  // target's — or the layer's — allow for that key.
  if (
    passAllowedKeys(
      layer.allowedKeys,
      disabledKeys(layer.allowedKeys, conditions),
      eventNames,
    )
  ) {
    return true;
  }

  for (const each of layer.currentFocusIds) {
    const target = getFocusTarget(layer, each);
    if (!target) continue;
    if (
      passAllowedKeys(
        target.allowedKeys,
        disabledKeys(target.allowedKeys, conditions),
        eventNames,
      )
    ) {
      return true;
    }
  }

  return false;
}

function hasWhenFalseBinding(
  bindings: BaseBoundKeyEntry[],
  eventNames: string[],
  conditions: Map<string, boolean>,
): boolean {
  return bindings.some(
    (b) =>
      !checkWhen(b.when, conditions) &&
      b.keys.some((k) => eventNames.includes(k)),
  );
}

function matchesOtherFocusTarget(
  layer: ElementKeyboard,
  eventNames: string[],
): boolean {
  const activeIds = new Set(
    layer.currentFocusIds.map((e) => {
      const groupKey =
        e.fromGroup === defaultTargetsSymbol
          ? String(defaultTargetsSymbol)
          : e.fromGroup;
      return `${groupKey}::${e.id}`;
    }),
  );

  for (const [id, ft] of layer.defaultTargets) {
    const key = `${String(defaultTargetsSymbol)}::${id}`;
    if (activeIds.has(key)) continue;
    if (ft.bindings.some((b) => b.keys.some((k) => eventNames.includes(k)))) {
      return true;
    }
  }

  for (const [groupName, group] of layer.focusTargets) {
    for (const [id, ft] of group.map) {
      const key = `${groupName}::${id}`;
      if (activeIds.has(key)) continue;
      if (ft.bindings.some((b) => b.keys.some((k) => eventNames.includes(k)))) {
        return true;
      }
    }
  }

  return false;
}

function invokeMissIfNeeded(
  layer: ElementKeyboard,
  handled: boolean,
  key: unknown,
  input: string,
  eventNames: string[],
  conditions: Map<string, boolean>,
): boolean {
  if (!layer.missListener.onMiss || !layer.missListener.onMissOptions) {
    return false;
  }

  const opts = layer.missListener.onMissOptions;
  if (handled) {
    layer.missListener.onMiss({ miss: false });
    return false;
  }

  if (
    opts.monitorWhen &&
    hasWhenFalseBinding(layer.bindings, eventNames, conditions)
  ) {
    layer.missListener.onMiss({ miss: true, key, input, eventNames });
    return true;
  }

  if (opts.monitorWhen && layer.currentFocusIds.length > 0) {
    for (const each of layer.currentFocusIds) {
      const ft = getFocusTarget(layer, each);
      if (ft && hasWhenFalseBinding(ft.bindings, eventNames, conditions)) {
        layer.missListener.onMiss({ miss: true, key, input, eventNames });
        return true;
      }
    }
  }

  if (opts.monitorFocusMismatch && matchesOtherFocusTarget(layer, eventNames)) {
    layer.missListener.onMiss({ miss: true, key, input, eventNames });
    return true;
  }

  layer.missListener.onMiss({ miss: true, key, input, eventNames });
  return true;
}

/**
 * Create the modal barrier processor (highest pipeline priority).
 *
 * The highest-z-index modal layer receives the event. Inside the modal,
 * all active elements are offered the event (broadcast). The modal still
 * consumes every unhandled event by default — the modal takes over the
 * keyboard while open, so nothing beneath it ever sees unhandled keys;
 * only keys registered via `allowModal` pass through to lower stages.
 *
 * `useModalMissListener` callbacks are invoked for consumed keys that
 * nothing on the modal layer handled, so the modal can react to unknown
 * keys (e.g. a "key not bound" hint).
 */
export function createModalProcessor<TComponent>(): ProcessorInput<TComponent> {
  return {
    active: true,
    process(ctx: PipelineContext<TComponent>): boolean {
      const modalLayer = ctx.allModalLayers[ctx.allModalLayers.length - 1];
      if (!modalLayer) return false;

      const keyboardLayer = ctx.layerKeyboardRefs.get(modalLayer.layerId);
      if (!keyboardLayer) return true;

      const elements = modalLayer.activeElements
        .map((id) => ({
          id,
          keyboard: keyboardLayer.elementKeyboards.get(id),
        }))
        .filter(
          (entry): entry is { id: string; keyboard: ElementKeyboard } =>
            entry.keyboard !== undefined,
        );

      if (elements.length === 0) return true;

      const penetrated = ctx.eventNames.filter((name) =>
        elements.some(({ keyboard }) =>
          keyMatchesRule(name, keyboard.penetrationKeys, ctx.conditions),
        ),
      );
      const available = ctx.eventNames.filter(
        (name) => !penetrated.includes(name),
      );

      let handled = false;
      for (const { id, keyboard } of elements) {
        const result = handlerElement(
          ctx,
          id,
          keyboard,
          keyboardLayer,
          true,
          available,
        );
        if (result === "sequence") {
          handled = true;
          break;
        }
        if (result) handled = true;
      }

      if (
        !handled &&
        elements.some(({ keyboard }) =>
          isAllowed(keyboard, ctx.eventNames, ctx.conditions),
        )
      ) {
        return false;
      }

      for (const { keyboard } of elements) {
        invokeMissIfNeeded(
          keyboard,
          handled,
          ctx.key,
          ctx.input,
          ctx.eventNames,
          ctx.conditions,
        );
      }

      return true;
    },
    id: "modal",
  };
}
