# NumberInput

Numeric input with step-based increment/decrement and digit typing.

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `value` | `number` | yes | — | Controlled value. |
| `onChange` | `(value: number) => void` | yes | — | Called on change. |
| `focusId` | `string` | yes | — | Focus target. |
| `min` | `number` | no | `-Infinity` | Minimum. |
| `max` | `number` | no | `Infinity` | Maximum. |
| `step` | `number` | no | `1` | Increment/decrement step. |

## Keyboard (scoped to `focusId`)

| Key | Action |
|-----|--------|
| `↑` / `→` | Increment by `step` |
| `↓` / `←` | Decrement by `step` |
| Digit keys | Append digit (e.g. `5` then `3` → `53`) |

## Best Practice

```tsx
<NumberInput
  focusId="age"
  value={age}
  onChange={setAge}
  min={0}
  max={120}
/>
```
