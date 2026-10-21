# Binding attribution and the owner stack

Every binding lives on one keyboard layer: a page component, a regular-layer element, or a modal-layer element. That landing point is its attribution, and the call site decides it.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Basic Binding](/keyboard/base-bind) | Registering bindings |
| [Keyboard Events Between Layers](/screen/layer-keyboard) | When layer-element bindings take effect |
| [Modal Layer Keyboard Events](/screen/modal-layer-keyboard) | When modal-element bindings take effect |

## The call site decides attribution

| Call site | Binding lands on | Active while |
|---|---|---|
| Page component | That screen's keyboard layer | The screen is in the navigation stack |
| Layer element | That element inside the layer | The layer is open and the element is `active` |
| Modal-layer element | That element inside the modal | The modal is on top |

```tsx
function Home() {
  const { boundKeyboard } = useKeyboard()

  useEffect(
    // Attributed to Home
    () => boundKeyboard('a', () => openPanel()),
    [boundKeyboard],
  )
}
```

## Owner and owner stack

When called through `useKeyboard()`, the owner is inferred from the call-site context:

- `LayerElementContext` → the layer ID;
- `ModalLayerElementContext` → the modal-layer ID;
- a page component → the page component itself.

The engine pushes the owner onto a stack while resolving the target, then pops it. With an empty stack it falls back in this order:

1. Top of the owner stack.
2. Topmost modal layer.
3. Topmost regular layer.
4. Current page.
5. Nothing → no owner.

With no owner, binding methods throw:

```
[keyboard-engine] boundKeyboard() must be called inside a screen component or overlay.
```

## elementId

A layer can host several elements, so the layer ID alone does not identify the target; `elementId` does. `useKeyboard()` injects it from context:

```tsx
boundKeyboard('w', () => step())                        // injected
boundKeyboard('w', () => step(), { elementId: 'body' }) // explicit override
```

Injection is the normal case. Pass it explicitly when registering from a page component into a layer element, or when using the module-level API.

## Boundaries

- Page bindings live as long as the page is in the navigation stack; leaving the page destroys its keyboard layer.
- Layer bindings stop when the layer closes, the element is paused, or a page switch clears the layer.
- Modal bindings participate only while the modal is on top.
- Do not rely on the empty-stack fallback; it is a safety net. Call inside the right component or element.
- Register in `useEffect` and return the unbind function to avoid ghost keys after unmount.
- Module-level calls can set the owner temporarily with `withOwner(owner, fn)`, see [Module-level keyboard API](/keyboard/module-api).
