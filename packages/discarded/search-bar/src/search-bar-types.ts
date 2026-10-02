import type React from "react";

export interface SearchBarItem<T> {
  /** Display text shown in the results list */
  label: string;
  /** Value returned to onSubmit when this item is selected */
  value: T;
  /** Optional stable key for React reconciliation */
  Key?: string;
}

export interface SearchBarProps<
  T,
  I extends SearchBarItem<T> = SearchBarItem<T>,
> {
  /** Focus identifier for the TextInput in the keyboard system */
  focusId: string;

  /**
   * Input area width in characters. When omitted, auto-detected from
   * terminal dimensions (columns - 4 for border + prompt).
   */
  width?: number;

  /** Items to search through. Filtered and sorted by label as the user types. */
  items?: I[];

  /**
   * Called when the user confirms a selection via the selectBar.
   * Receives the selected item.
   */
  onSubmit?: (item: I) => void;

  /**
   * Component that renders the filtered results and handles selection.
   * Receives filtered items, an onSelect callback, a focusId for keyboard
   * integration, and the current query string.
   *
   * Must be a component that registers its own keyboard bindings under the
   * given focusId (e.g. SelectInput).
   */
  selectBar: React.ComponentType<{
    items: I[];
    onSelect: (item: I) => void;
    focusId: string;
    query: string;
  }>;
}