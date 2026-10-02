# Tabs

Tab bar with left/right navigation and content rendering.

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `focusId` | `string` | yes | — | Focus target for tab bar. |
| `tabs` | `Tab[]` | yes | — | `{ id: string, label: string, content: ReactNode }` |
| `activeTab` | `string` | no | — | Controlled: active tab id. |
| `onChange` | `(id: string) => void` | no | — | Controlled: called on tab change. |
| `defaultActiveTab` | `string` | no | First tab | Uncontrolled initial tab. |

## Keyboard (scoped to `focusId`)

| Key | Action |
|-----|--------|
| `←` | Previous tab (wraps) |
| `→` | Next tab (wraps) |

## Best Practice

```tsx
<Tabs
  focusId="main-tabs"
  tabs={[
    { id: 'info', label: 'Info', content: <InfoPanel /> },
    { id: 'logs', label: 'Logs', content: <LogPanel /> },
  ]}
/>
```
