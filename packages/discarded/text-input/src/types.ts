/**
 * Props for the controlled TextInput component.
 * @template T - The type of the value (typically string).
 */
export type TextInputProps = {
  /**
   * Placeholder text shown when value is empty.
   */
  readonly placeholder?: string;

  /**
   * Replace all characters with this mask string (e.g. '*' for passwords).
   */
  readonly mask?: string;

  /**
   * Whether to show a visual cursor and allow arrow key navigation.
   * @default true
   */
  readonly showCursor?: boolean;

  /**
   * Highlight the last pasted text block (multiple characters inserted at once).
   * @default false
   */
  readonly highlightPastedText?: boolean;

  /**
   * Current value of the input (controlled).
   */
  readonly value: string;

  /**
   * Called when the value changes.
   */
  readonly onChange: (value: string) => void;

  /**
   * Called when the Enter key is pressed.
   */
  readonly onSubmit?: (value: string) => void;

  /**
   * Focus identifier used by the keyboard system.
   * Must be unique on the current screen.
   */
  readonly focusId: string;

  /**
   * When true, text wraps to the next line instead of virtual-scrolling.
   * Up/down arrow keys navigate between wrapped lines.
   * @default false
   */
  readonly wrap?: boolean;

  /**
   * Available width in characters. When omitted, auto-detected from
   * terminal dimensions via useWindowSize.
   */
  readonly width?: number;
};

/**
 * Props for the uncontrolled TextInput component.
 */
export type UncontrolledTextInputProps = {
  /**
   * Initial value when the component mounts.
   * @default ''
   */
  readonly initialValue?: string;
} & Omit<TextInputProps, 'value' | 'onChange'>;
