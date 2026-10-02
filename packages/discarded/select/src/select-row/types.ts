import React from 'react';
import type { Item } from '../select/types.js';

// Re-export Item from select/types to keep a single canonical definition.
export type { Item };

export interface SelectRowProps<T, I extends Item<T> = Item<T>> {
  /** Array of items to display and select from. */
  items: I[];
  /** Called when the user presses Enter or a number key. */
  onSelect: (item: I) => void;
  /** Custom item renderer. */
  itemComponent?: React.ComponentType<I & { isSelected: boolean }>;
  /** Custom indicator renderer (rendered below the item). */
  indicatorComponent?: React.ComponentType<{ isSelected: boolean }>;
  /**
   * Focus target id. Required to ensure visual state matches keyboard behaviour.
   * When omitted at the type level, the component would fall back to screen-level
   * bindings that lose to any active focus target in handleLayer.
   */
  focusId: string;
  /** When the number of items exceeds this, the list will scroll. */
  limit?: number;
}
