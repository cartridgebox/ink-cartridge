# TextInput

Controlled text input with cursor, masking, and submission.

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `value` | `string` | yes | — | Controlled value. |
| `onChange` | `(value: string) => void` | yes | — | Called on every change. |
| `focusId` | `string` | yes | — | Focus target. |
| `placeholder` | `string` | no | `''` | Shown when value is empty. |
| `mask` | `string` | no | — | Replace each character (e.g. `*` for passwords). |
| `showCursor` | `boolean` | no | `true` | Visual cursor + arrow key navigation. |
| `highlightPastedText` | `boolean` | no | `false` | Highlight multi-character insertions. |
| `onSubmit` | `(value: string) => void` | no | — | Called on Enter. |
| `wrap` | `boolean` | no | `false` | Wrap text to multiple lines instead of virtual-scrolling horizontally. Enables `↑`/`↓` navigation. |
| `width` | `number` | no | terminal width | Available width in characters. Controls wrap boundary and virtual-scroll viewport. |

## Keyboard (scoped to `focusId`)

| Key | Action |
|-----|--------|
| `←` / `→` | Move cursor (only when `showCursor`) |
| `↑` / `↓` | Move cursor between wrapped lines (only when `wrap`) |
| `Backspace` | Delete left of cursor |
| `Delete` | Delete right of cursor |
| `Enter` | Submit (only when `onSubmit` provided) |
| Any character | Insert at cursor |

## Best Practice

Basic single-line input:

```tsx
const [name, setName] = useState('');

<TextInput
  focusId="name"
  value={name}
  onChange={setName}
  placeholder="Enter your name"
/>
```

Multi-line / wrap mode for longer text:

```tsx
<TextInput
  focusId="notes"
  value={notes}
  onChange={setNotes}
  wrap
  width={60}
  placeholder="Write your notes..."
/>
```
