import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import { useKeyboard } from 'ink-cartridge';
import type { SelectRowProps, Item } from './types.js';
import { defaultItem } from '../tools/select/utils.js';
import { useSelectNavigation } from '../tools/select/useSelectNavigation.js';

function defaultIndicator({ isSelected }: { isSelected: boolean }) {
  return (
    <Box marginTop={1}>
      {isSelected ? <Text color="blue">{'●'}</Text> : <Text> </Text>}
    </Box>
  );
}

/**
 * A horizontal single-select list component integrated with the ink-cartridge
 * keyboard and focus system.
 *
 * Symmetric to {@link SelectInput} but items are laid out horizontally and
 * navigated with left/right arrows (or vim-style h/l). The indicator is
 * rendered below each item instead of to the left.
 *
 * Each instance registers a focus target identified by {@link SelectRowProps.focusId}
 * on the current screen's keyboard layer. Users navigate between multiple
 * interactive components on the same screen with Tab / Shift+Tab.
 *
 * When the component is not the active focus target, its items are visually
 * dimmed and no key events are delivered to it.
 *
 * @typeParam T - The type of the value associated with each item.
 * @typeParam I - The extended item type, must extend Item<T>. Defaults to Item<T>.
 * @2026-06-28 v3.8.0
 */
export function SelectRow<T, I extends Item<T> = Item<T>>({
  items = [],
  onSelect,
  itemComponent,
  indicatorComponent,
  focusId,
  limit: limitProp = 10,
}: SelectRowProps<T, I>) {
  // focusId is required — same rationale as SelectInput.
  // @2026-06-28 v3.8.0
  const { isFocused, selectedIndex, visibleItems, moveHighlight, selectedIndexRef, visibleItemsRef, onSelectRef } =
    useSelectNavigation<I>({ items, limit: limitProp, focusId, onSelect });

  const { boundKeyboard } = useKeyboard();

  const IndicatorComp = indicatorComponent ?? defaultIndicator;
  const ItemComp = (itemComponent ??
    (defaultItem as unknown as React.ComponentType<I & { isSelected: boolean }>));

  // Keyboard bindings — horizontal navigation (left/right/h/l)
  useEffect(() => {
    const fid = focusId;

    const unLeft = boundKeyboard(['left', 'h'], () => moveHighlight(-1), { focusId: fid });
    const unRight = boundKeyboard(['right', 'l'], () => moveHighlight(1), { focusId: fid });
    const unReturn = boundKeyboard(['return'], () => {
      const item = visibleItemsRef.current[selectedIndexRef.current];
      if (item) onSelectRef.current(item);
    }, { focusId: fid });

    const numUnbinds: Array<() => void> = [];
    for (let i = 1; i <= Math.min(9, visibleItems.length); i++) {
      const idx = i - 1;
      numUnbinds.push(
        boundKeyboard([String(i)], () => {
          const item = visibleItemsRef.current[idx];
          if (item) onSelectRef.current(item);
        }, { focusId: fid }),
      );
    }

    return () => {
      unLeft();
      unRight();
      unReturn();
      numUnbinds.forEach((fn) => fn());
    };
  }, [focusId, boundKeyboard, moveHighlight, visibleItems.length, onSelectRef, selectedIndexRef, visibleItemsRef]);

  return (
    <Box flexDirection="row">
      {visibleItems.map((item, index) => {
        const isItemSelected = index === selectedIndex && isFocused;
        return (
          <Box key={(item as I).Key ?? String((item as I).value)} flexDirection="column" marginRight={2}>
            <ItemComp {...(item as any)} isSelected={isItemSelected} />
            <IndicatorComp isSelected={isItemSelected} />
          </Box>
        );
      })}
    </Box>
  );
}
