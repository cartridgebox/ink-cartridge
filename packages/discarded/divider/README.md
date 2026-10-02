# Divider

Horizontal line with optional centered label.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | — | Centered label text. |
| `char` | `string` | `'─'` | Line character. |
| `width` | `number` | `50` | Total width in characters. |

All text is rendered with `dimColor` for a subdued appearance.

## Best Practice

```tsx
<Divider label="Section 1" />
// ───────── Section 1 ─────────
```
