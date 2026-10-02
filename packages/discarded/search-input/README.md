# SearchInput

Text input with search styling — a blue "Search " prefix, inner TextInput, and `╳` suffix when non-empty.

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `value` | `string` | yes | — | Controlled value. |
| `onChange` | `(value: string) => void` | yes | — | Called on change. |
| `focusId` | `string` | yes | — | Focus target (shared with inner TextInput). |
| `placeholder` | `string` | no | — | Placeholder text. |
| `onSubmit` | `(value: string) => void` | no | — | Called on Enter. |

## Keyboard (scoped to `focusId`)

All TextInput keys plus:

| Key | Action |
|-----|--------|
| `Escape` | Clear value to `''` |

## Best Practice

```tsx
<SearchInput
  focusId="search"
  value={query}
  onChange={setQuery}
  onSubmit={(v) => performSearch(v)}
  placeholder="Search..."
/>
```
