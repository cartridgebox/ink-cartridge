import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useKeyboard, useFocusState } from 'ink-cartridge';
import { clamp } from './utils.js';

export interface UseSelectNavigationOptions<TItem> {
  /** Array of items to select from. */
  items: TItem[];
  /** Maximum visible items before scrolling. */
  limit: number;
  /** Focus target id (required — see SelectInput for rationale). */
  focusId: string;
  /** Callback invoked when user selects an item (Enter or number key). */
  onSelect: (item: TItem) => void;
}

export interface UseSelectNavigationResult<TItem> {
  /** Whether this component's focus target is currently active. */
  isFocused: boolean;
  /** Index of the highlighted item within visibleItems. */
  selectedIndex: number;
  /** The currently visible slice of items. */
  visibleItems: TItem[];
  /** Move the highlight by delta steps (negative = up/left, positive = down/right). */
  moveHighlight: (delta: number) => void;
  /** Ref holding the current selectedIndex for use in keyboard callbacks. */
  selectedIndexRef: { current: number };
  /** Ref holding the current visibleItems for use in keyboard callbacks. */
  visibleItemsRef: { current: TItem[] };
  /** Ref holding the current onSelect callback for use in keyboard callbacks. */
  onSelectRef: { current: (item: TItem) => void };
}

/**
 * Shared state management hook for select-style components (SelectInput and SelectRow).
 *
 * Encapsulates scroll offset, item boundary correction,
 * highlight movement, and focus lifecycle — everything that is direction-agnostic.
 * The caller is responsible for wiring keyboard bindings and rendering layout.
 *
 * @typeParam TItem - The type of items in the list.
 * @2026-06-28 v3.8.0
 */
export function useSelectNavigation<TItem>({
  items,
  limit: limitProp,
  focusId,
  onSelect,
}: UseSelectNavigationOptions<TItem>): UseSelectNavigationResult<TItem> {
  const isFocused = useFocusState(focusId);
  const { focusUnregister } = useKeyboard();

  const hasLimit = items.length > limitProp;
  const limit = hasLimit ? limitProp : items.length;

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Refs keep latest values accessible in keyboard callbacks without re-binding.
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Slice the visible window when items exceed the limit.
  const visibleItems = useMemo(() => {
    if (!hasLimit) return items;
    return items.slice(scrollOffset, scrollOffset + limit);
  }, [items, hasLimit, limit, scrollOffset]);

  const visibleItemsRef = useRef(visibleItems);
  visibleItemsRef.current = visibleItems;

  // Correct selectedIndex and scrollOffset when items shrink or limit changes.
  useEffect(() => {
    if (items.length === 0) {
      setSelectedIndex(0);
      setScrollOffset(0);
      return;
    }
    if (scrollOffset + limit > items.length) {
      setScrollOffset(Math.max(0, items.length - limit));
    }
    if (selectedIndex >= limit || selectedIndex >= visibleItems.length) {
      setSelectedIndex(clamp(items.length > 0 ? items.length - 1 : 0, 0, limit - 1));
    }
  }, [items.length, scrollOffset, limit, selectedIndex, visibleItems.length]);

  // Direction-agnostic highlight movement — delta is +1 or -1 regardless of axis.
  const moveHighlight = useCallback(
    (delta: number) => {
      setSelectedIndex((prev) => {
        if (!hasLimit) {
          return clamp(prev + delta, 0, Math.max(0, items.length - 1));
        }
        const absIdx = scrollOffset + prev;
        const newAbs = clamp(absIdx + delta, 0, Math.max(0, items.length - 1));
        if (newAbs < scrollOffset) {
          setScrollOffset(newAbs);
          return 0;
        }
        if (newAbs >= scrollOffset + limit) {
          setScrollOffset(newAbs - limit + 1);
          return limit - 1;
        }
        return newAbs - scrollOffset;
      });
    },
    [hasLimit, items.length, limit, scrollOffset],
  );

  // Unregister the focus target when this component unmounts.
  useEffect(() => {
    return () => focusUnregister(focusId);
  }, [focusId, focusUnregister]);

  return {
    isFocused,
    selectedIndex,
    visibleItems,
    moveHighlight,
    selectedIndexRef,
    visibleItemsRef,
    onSelectRef,
  };
}
