# Fold

Collapsible section with toggle and optional preview.

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `focusId` | `string` | yes | — | Focus target. |
| `label` | `string` | yes | — | Header label. |
| `children` | `ReactNode` | yes | — | Content shown when expanded. |
| `preview` | `ReactNode` | no | — | Shown when folded. |
| `expanded` | `boolean` | no | — | Controlled. |
| `onToggle` | `() => void` | no | — | Controlled callback. |
| `defaultExpanded` | `boolean` | no | `false` | Uncontrolled initial state. |

## Keyboard (scoped to `focusId`)

| Key | Action |
|-----|--------|
| `Space` | Toggle |

## Best Practice

```tsx
<Fold focusId="details" label="Advanced Options">
  <NumberInput focusId="detail-num" value={n} onChange={setN} />
</Fold>
```
