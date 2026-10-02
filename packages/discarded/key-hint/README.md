# KeyHint

Display keyboard shortcut hints.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `keys` | `{ key: string; desc: string }[]` | `[]` | Array of key-description pairs. |

## Best Practice

```tsx
<KeyHint keys={[
  { key: 's', desc: 'Start game' },
  { key: 'q', desc: 'Quit' },
]} />
// [s] Start game  [q] Quit
```
