# Spinner

Animated loading indicator with 5 built-in styles.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `type` | `SpinnerType` | `'dots'` | Animation style. `SpinnerType` = `'dots' \| 'line' \| 'simple' \| 'triangle' \| 'arc'`. |
| `label` | `string` | — | Text displayed after the spinner. |
| `color` | `string` | — | Ink text color. |
| `speed` | `number` | `80` | Animation interval in milliseconds between frames. |
| `active` | `boolean` | `true` | When `false`, pauses at frame 0. |

## Best Practice

```tsx
<Spinner type="dots" label="Loading..." />
```
