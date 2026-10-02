# Form

Form container with validation, submission, and programmatic submit via ref.

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `children` | `ReactNode` | yes | — | Form fields. |
| `onSubmit` | `(values: Record<string, any>) => void` | yes | — | Called on valid submit. |
| `onError` | `(errors: Record<string, string \| undefined>) => void` | no | — | Called on validation failure. |
| `initialValues` | `Record<string, any>` | no | `{}` | Initial field values. |
| `submitRef` | `MutableRefObject<(() => void) \| undefined>` | no | — | Exposes `submitForm()` externally. |

## Keyboard

| Key | Scope | Action |
|-----|-------|--------|
| `Ctrl+S` | Screen-level | Submit form |

## Best Practice

```tsx
<Form
  initialValues={{ name: '', age: 0 }}
  onSubmit={(values) => save(values)}
  onError={(errors) => console.log(errors)}
>
  <Field name="name" rules={[required]}>
    {({ value, onChange, error, focusId }) => (
      <Box>
        <TextInput focusId={focusId} value={value} onChange={onChange} />
        {error && <Text color="red">{error}</Text>}
      </Box>
    )}
  </Field>
</Form>
```
