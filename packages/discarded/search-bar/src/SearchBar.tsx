import { Box, Text, useWindowSize } from "ink";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { TextInput } from '@cartridge-engine/text-input';
import { useKeyboard } from 'ink-cartridge';
import type { SearchBarItem, SearchBarProps } from "./search-bar-types.js";

/**
 * Filter and sort items by query against their labels.
 * Priority: exact match → prefix match → earlier substring position.
 */
function filterAndSort<T>(
  items: SearchBarItem<T>[],
  query: string,
): SearchBarItem<T>[] {
  if (!query.trim()) return items;
  const lower = query.toLowerCase();
  return items
    .filter((item) => item.label.toLowerCase().includes(lower))
    .sort((a, b) => {
      const aLower = a.label.toLowerCase();
      const bLower = b.label.toLowerCase();
      if (aLower === lower && bLower !== lower) return -1;
      if (aLower !== lower && bLower === lower) return 1;
      const aStarts = aLower.startsWith(lower);
      const bStarts = bLower.startsWith(lower);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return aLower.indexOf(lower) - bLower.indexOf(lower);
    });
}

export default function SearchBar<
  T,
  I extends SearchBarItem<T> = SearchBarItem<T>,
>({
  focusId,
  width,
  items = [],
  onSubmit,
  selectBar: SelectBar,
}: SearchBarProps<T, I>) {
  const [value, setValue] = useState("");
  const { columns } = useWindowSize();
  const { focusSet, boundKeyboard } = useKeyboard();

  const inputWidth = width ?? Math.max(1, columns - 4);
  const resultsFocusId = `${focusId}-results`;

  // Filter and sort results whenever the query or items change.
  const results = useMemo(
    () => filterAndSort(items, value),
    [items, value],
  );

  /**
   * When selectBar confirms a selection, fire onSubmit and return
   * focus to the TextInput.
   */
  const handleSelect = useCallback(
    (item: I) => {
      onSubmit?.(item);
      focusSet(focusId);
    },
    [onSubmit, focusSet, focusId],
  );
  

  // Enter in TextInput switches focus to the selectBar.
  // Registered at screen level so it fires after TextInput's focus-level
  // bindings (TextInput does not bind 'return' when onSubmit is not passed).
  useEffect(() => {
    const unReturn = boundKeyboard(['return'], () => {
      focusSet(resultsFocusId);
    });
    return unReturn;
  }, [boundKeyboard, focusSet, resultsFocusId]);

  return (
    <Box
      flexDirection="column"
      width="100%"
      height="100%"
      borderColor="white"
      borderStyle="bold"
    >
      <Box flexDirection="row">
        <Text bold>{"> "}</Text>
        <TextInput
          focusId={focusId}
          value={value}
          onChange={setValue}
          width={inputWidth}
        />
      </Box>
      <Text bold>
        {"-".repeat(inputWidth)}
      </Text>
      <SelectBar
        items={results as I[]}
        onSelect={handleSelect}
        focusId={resultsFocusId}
        query={value}
      />
    </Box>
  );
}