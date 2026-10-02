import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import { useKeyboard } from 'ink-cartridge';
import type { SelectInputProps, Item } from './types.js';
import { defaultItem } from '../tools/select/utils.js';
import { useSelectNavigation } from '../tools/select/useSelectNavigation.js';

function defaultIndicator({ isSelected }: { isSelected: boolean }) {
  return (
    <Box marginRight={1}>
      {isSelected ? <Text color="blue">{'❯'}</Text> : <Text> </Text>}
    </Box>
  );
}

/**
 * A single-select list component integrated with the ink-cartridge keyboard and
 * focus system.
 *
 * Each instance registers a focus target identified by {@link SelectInputProps.focusId}
 * on the current screen's keyboard layer. Users navigate between multiple
 * SelectInputs on the same screen with Tab / Shift+Tab. Within the active
 * component, arrow keys (or vim-style j/k) move the highlight, and Enter
 * confirms the selection. Number keys 1-9 directly select an item.
 *
 * When the component is not the active focus target, its items are visually
 * dimmed and no key events are delivered to it.
 *
 * @typeParam T - The type of the value associated with each item.
 * @typeParam I - The extended item type, must extend Item<T>. Defaults to Item<T>.
 */
export function SelectInput<T, I extends Item<T> = Item<T>>({
  items = [],
  onSelect,
  itemComponent,
  indicatorComponent,
  focusId,
  limit: limitProp = 10,
}: SelectInputProps<T, I>) {
  // focusId is required because screen-level bindings lose to any active focus
  // target in handleLayer — the indicator would light up but keys would not arrive.
  // @2026-06-28 v3.8.0
  const { isFocused, selectedIndex, visibleItems, moveHighlight, selectedIndexRef, visibleItemsRef, onSelectRef } =
    useSelectNavigation<I>({ items, limit: limitProp, focusId, onSelect });

  const { boundKeyboard } = useKeyboard();

  const IndicatorComp = indicatorComponent ?? defaultIndicator;
  const ItemComp = (itemComponent ??
    (defaultItem as unknown as React.ComponentType<I & { isSelected: boolean }>));

  // Keyboard bindings
  useEffect(() => {
    const fid = focusId;

    const unUp = boundKeyboard(['up', 'k'], () => moveHighlight(-1), { focusId: fid });
    const unDown = boundKeyboard(['down', 'j'], () => moveHighlight(1), { focusId: fid });
    const unReturn = boundKeyboard(['return'], () => {
      const item = visibleItemsRef.current[selectedIndexRef.current];
      if (item) onSelectRef.current?.(item);
    }, { focusId: fid });

    const numUnbinds: Array<() => void> = [];
    for (let i = 1; i <= Math.min(9, visibleItems.length); i++) {
      const idx = i - 1;
      numUnbinds.push(
        boundKeyboard([String(i)], () => {
          const item = visibleItemsRef.current[idx];
          if (item) onSelectRef.current?.(item);
        }, { focusId: fid }),
      );
    }

    return () => {
      unUp();
      unDown();
      unReturn();
      numUnbinds.forEach((fn) => fn());
    };
  }, [focusId, boundKeyboard, moveHighlight, visibleItems.length, onSelectRef, selectedIndexRef, visibleItemsRef]);

  return (
    <Box flexDirection="column">
      {visibleItems.map((item, index) => {
        const isItemSelected = index === selectedIndex && isFocused;
        return (
          <Box key={(item as I).Key ?? String((item as I).value)}>
            <IndicatorComp isSelected={isItemSelected} />
            <ItemComp {...(item as any)} isSelected={isItemSelected} />
          </Box>
        );
      })}
    </Box>
  );
}
