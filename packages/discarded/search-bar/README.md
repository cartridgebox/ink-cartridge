# SearchBar

A search bar that filters items as you type and delegates result selection to a pluggable `selectBar` component.

## Type Parameters

| Param | Constraint | Default | Description |
|-------|-----------|---------|-------------|
| `T` | — | — | The value type of each search item. |
| `I` | `SearchBarItem<T>` | `SearchBarItem<T>` | The item type (must have `label`, `value`, and optional `Key`). |

## SearchBarItem\<T\>

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | `string` | yes | Display text matched against the query. |
| `value` | `T` | yes | Value returned to `onSubmit` on selection. |
| `Key` | `string` | no | Stable key for React reconciliation. |

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `focusId` | `string` | yes | — | Focus identifier for the TextInput. A second focus (`${focusId}-results`) is created for the selectBar. |
| `items` | `I[]` | no | `[]` | Items to search. Filtered and sorted by label as the user types. |
| `onSubmit` | `(item: I) => void` | no | — | Called when the user confirms a selection in the selectBar. |
| `selectBar` | `React.ComponentType<{ items: I[]; onSelect: (item: I) => void; focusId: string; query: string }>` | yes | — | Pluggable component that renders and manages the results list. |
| `width` | `number` | no | `columns - 4` | Width of the input area in characters. |

### selectBar component props

The `selectBar` component receives these props:

| Prop | Type | Description |
|------|------|-------------|
| `items` | `I[]` | Filtered and sorted items matching the current query. |
| `onSelect` | `(item: I) => void` | Call to confirm a selection. SearchBar wraps this to fire `onSubmit` and return focus to the input. |
| `focusId` | `string` | Focus identifier (`${focusId}-results`) for the selectBar's keyboard bindings. |
| `query` | `string` | Current search query string. |

## Filtering & Sorting

Items are filtered by case-insensitive substring match against `label`. Matches are sorted by priority:

1. Exact match
2. Prefix match (starts with query)
3. Earlier substring position

## Keyboard

| Context | Key | Action |
|---------|-----|--------|
| TextInput | All TextInput keys | Edit search query normally. |
| TextInput | `Enter` | Move focus to the selectBar results list. |
| selectBar | Component-defined | Navigate and confirm selection. |
| After selection | — | `onSubmit` fires, focus returns to TextInput. |

## Best Practice

```tsx
import { SearchBar, SelectInput } from 'ink-cartridge';

interface MyItem extends SearchBarItem<string> {
  detail: string;
}

const items: MyItem[] = [
  { label: 'Alice', value: 'alice', detail: 'Engineer' },
  { label: 'Bob', value: 'bob', detail: 'Designer' },
];

<SearchBar<string, MyItem>
  focusId="user-search"
  items={items}
  onSubmit={(item) => console.log('Selected:', item)}
  selectBar={SelectInput}
/>
```
