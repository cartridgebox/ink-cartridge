# ProgressBar

Visual progress indicator with configurable characters and width.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `percent` | `number` | `0` | 0–100. Clamped to range. |
| `width` | `number` | `20` | Bar width in characters. |
| `color` | `string` | `'cyan'` | Ink text color. |
| `showPercent` | `boolean` | `true` | Show percentage text after the bar. |
| `char` | `string` | `'█'` | Filled character. |
| `emptyChar` | `string` | `'░'` | Empty character. |

## Best Practice

```tsx
<ProgressBar percent={75} />
// [███████████████░░░░░] 75%
```
