import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Text, Box, useWindowSize } from 'ink';
import chalk from 'chalk';
import { useKeyboard, useFocusState } from 'ink-cartridge';
import type { TextInputProps, UncontrolledTextInputProps } from './types.js';

function repeatChar(char: string, count: number): string {
  return Array(count + 1).join(char);
}

/**
 * Split text into wrapped lines at maxWidth boundaries.
 */
function wrapLines(text: string, maxWidth: number): string[] {
  if (maxWidth <= 0 || text.length === 0) return [''];
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += maxWidth) {
    lines.push(text.slice(i, i + maxWidth));
  }
  return lines;
}

/**
 * Convert a flat cursor offset to {line, col} in wrap mode.
 */
function offsetToLineCol(offset: number, maxWidth: number): { line: number; col: number } {
  if (maxWidth <= 0) return { line: 0, col: 0 };
  return {
    line: Math.floor(offset / maxWidth),
    col: offset % maxWidth,
  };
}

/**
 * Convert {line, col} back to a flat cursor offset, clamped to [0, textLength].
 */
function lineColToOffset(
  line: number,
  col: number,
  maxWidth: number,
  textLength: number,
): number {
  const offset = line * maxWidth + col;
  return Math.max(0, Math.min(offset, textLength));
}

function renderWithCursor(
  value: string,
  placeholder: string,
  mask: string | undefined,
  showCursor: boolean,
  isFocused: boolean,
  cursorOffset: number,
  cursorWidth: number,
  highlightPastedText: boolean,
): string {
  const displayValue = mask ? repeatChar(mask, value.length) : value;

  if (!showCursor || !isFocused) {
    if (displayValue.length === 0 && placeholder) {
      return chalk.grey(placeholder);
    }
    return displayValue;
  }

  if (displayValue.length === 0 && placeholder) {
    if (placeholder.length === 0) return chalk.inverse(' ');
    return chalk.inverse(placeholder[0]) + chalk.grey(placeholder.slice(1));
  }

  const actualHighlightWidth = highlightPastedText ? cursorWidth : 0;

  let result = '';
  for (let i = 0; i < displayValue.length; i++) {
    const isInHighlight = highlightPastedText
      ? i >= cursorOffset - actualHighlightWidth && i < cursorOffset
      : i >= cursorOffset - actualHighlightWidth && i <= cursorOffset;
    result += isInHighlight ? chalk.inverse(displayValue[i]) : displayValue[i];
  }

  if (cursorOffset === displayValue.length) {
    result += chalk.inverse(' ');
  }

  return result;
}

export function TextInput({
  placeholder = '',
  mask,
  showCursor = true,
  highlightPastedText = false,
  value: originalValue,
  onChange,
  onSubmit,
  focusId,
  wrap = false,
  width,
}: TextInputProps) {
  const isFocused = useFocusState(focusId);
  const { boundKeyboard, focusUnregister, enableWildcardPriority } = useKeyboard();
  const { columns: terminalColumns } = useWindowSize();

  // Available width: prop override or terminal width.
  const availableWidth = Math.max(1, (width ?? terminalColumns) || 80);

  // Virtual-scroll offset (only used when wrap=false).
  const [scrollOffset, setScrollOffset] = useState(0);
  // Cursor position (flat character index).
  const [cursorOffset, setCursorOffset] = useState(originalValue.length);
  // Paste highlight width.
  const [cursorWidth, setCursorWidth] = useState(0);
  // Wildcard priority disable function.
  const disablePriorityRef = useRef<(() => void) | null>(null);

  // Clamp cursor when external value shortens.
  useEffect(() => {
    setCursorOffset((prev) => Math.min(prev, originalValue.length));
  }, [originalValue]);

  // When wrap mode changes or text is cleared externally, reset scroll.
  const isTextEmpty = originalValue.length === 0;
  useEffect(() => {
    setScrollOffset(0);
  }, [wrap, isTextEmpty]);

  /**
   * Ensure the cursor is visible within the virtual-scroll window.
   * No-op when wrap is enabled.
   */
  const ensureVisible = useCallback(
    (newOffset: number) => {
      if (wrap) return;
      // Reserve 1 char per side for scroll indicators.
      const visibleW = Math.max(1, availableWidth - 2);
      const maxScroll = Math.max(0, originalValue.length - visibleW);
      setScrollOffset((prev) => {
        let next = prev;
        if (newOffset < next) next = newOffset;
        if (newOffset >= next + visibleW) next = newOffset - visibleW + 1;
        return Math.max(0, Math.min(next, maxScroll));
      });
    },
    [wrap, availableWidth, originalValue.length],
  );

  const moveCursor = useCallback(
    (delta: number) => {
      if (!showCursor) return;
      setCursorOffset((prev) => {
        const next = prev + delta;
        const clamped = Math.max(0, Math.min(next, originalValue.length));
        ensureVisible(clamped);
        return clamped;
      });
      setCursorWidth(0);
    },
    [showCursor, originalValue.length, ensureVisible],
  );

  /**
   * Vertical cursor movement for wrap mode.
   */
  const moveCursorVertical = useCallback(
    (delta: number) => {
      if (!showCursor || !wrap) return;
      const { line, col } = offsetToLineCol(cursorOffset, availableWidth);
      const targetLine = Math.max(0, line + delta);
      const newOffset = lineColToOffset(targetLine, col, availableWidth, originalValue.length);
      setCursorOffset(newOffset);
      setCursorWidth(0);
    },
    [showCursor, wrap, cursorOffset, availableWidth, originalValue.length],
  );

  const modifyText = useCallback(
    (insertion?: string, isForwardDelete = false) => {
      let newValue = originalValue;
      let newOffset = cursorOffset;

      if (insertion === undefined) {
        // Delete.
        if (isForwardDelete && cursorOffset < originalValue.length) {
          newValue =
            originalValue.slice(0, cursorOffset) +
            originalValue.slice(cursorOffset + 1);
        } else if (!isForwardDelete && cursorOffset > 0) {
          newValue =
            originalValue.slice(0, cursorOffset - 1) +
            originalValue.slice(cursorOffset);
          newOffset = cursorOffset - 1;
        } else {
          return;
        }
      } else {
        // Insert.
        newValue =
          originalValue.slice(0, cursorOffset) +
          insertion +
          originalValue.slice(cursorOffset);
        newOffset = cursorOffset + insertion.length;
      }

      newOffset = Math.max(0, Math.min(newOffset, newValue.length));

      setCursorOffset(newOffset);
      ensureVisible(newOffset);

      if (insertion && insertion.length > 1 && highlightPastedText) {
        setCursorWidth(insertion.length);
      } else {
        setCursorWidth(0);
      }

      if (newValue !== originalValue) {
        onChange(newValue);
      }
    },
    [originalValue, cursorOffset, onChange, highlightPastedText, ensureVisible],
  );

  // Focus lifecycle.
  useEffect(() => {
    return () => focusUnregister(focusId);
  }, [focusId, focusUnregister]);

  // Keyboard bindings.
  useEffect(() => {
    const fid = focusId;
    const unbindList: Array<() => void> = [];

    disablePriorityRef.current?.();
    const disablePriority = enableWildcardPriority();
    disablePriorityRef.current = disablePriority;

    // Left/right.
    unbindList.push(boundKeyboard(['left'], () => moveCursor(-1), { focusId: fid }));
    unbindList.push(boundKeyboard(['right'], () => moveCursor(1), { focusId: fid }));

    // Up/down (wrap mode only).
    if (wrap) {
      unbindList.push(boundKeyboard(['up'], () => moveCursorVertical(-1), { focusId: fid }));
      unbindList.push(boundKeyboard(['down'], () => moveCursorVertical(1), { focusId: fid }));
    }

    // Backspace / Delete.
    unbindList.push(
      boundKeyboard(['backspace'], () => modifyText(), { focusId: fid }),
    );
    unbindList.push(
      boundKeyboard(['delete'], () => modifyText(undefined, true), { focusId: fid }),
    );

    // Enter — submit.
    if (onSubmit) {
      unbindList.push(
        boundKeyboard(['return'], () => {
          disablePriority();
          disablePriorityRef.current = null;
          onSubmit(originalValue);
        }, { focusId: fid }),
      );
    }

    // Wildcard: capture all character input.
    unbindList.push(
      boundKeyboard(['*'], (input) => modifyText(input), { focusId: fid }),
    );

    return () => {
      unbindList.forEach((fn) => fn());
      if (disablePriorityRef.current) {
        disablePriorityRef.current();
        disablePriorityRef.current = null;
      }
    };
  }, [
    focusId,
    boundKeyboard,
    moveCursor,
    moveCursorVertical,
    modifyText,
    onSubmit,
    originalValue,
    enableWildcardPriority,
    wrap,
  ]);

  // ── Render: wrap mode ──────────────────────────────────────────

  if (wrap) {
    const baseLines = wrapLines(originalValue, availableWidth);
    const displayLines = baseLines.length === 0 ? [''] : [...baseLines];
    const { line: cursorLine, col: cursorCol } = offsetToLineCol(cursorOffset, availableWidth);

    // When empty and placeholder is set, show placeholder on first line.
    if (originalValue.length === 0 && placeholder) {
      return (
        <Box flexDirection="column">
          <Text>{renderWithCursor('', placeholder, mask, showCursor, isFocused, 0, 0, false)}</Text>
        </Box>
      );
    }

    // Ensure the cursor always has a line to render on,
    // even when it sits at the exact end of the last wrapped line.
    while (displayLines.length <= cursorLine) {
      displayLines.push('');
    }

    return (
      <Box flexDirection="column">
        {displayLines.map((line, i) => {
          if (i === cursorLine) {
            return (
              <Text key={i}>
                {renderWithCursor(
                  line,
                  '',
                  mask,
                  showCursor,
                  isFocused,
                  cursorCol,
                  cursorWidth,
                  highlightPastedText,
                )}
              </Text>
            );
          }
          return <Text key={i}>{line}</Text>;
        })}
      </Box>
    );
  }

  // ── Render: virtual-scroll mode ────────────────────────────────

  if (originalValue.length === 0 && placeholder) {
    return (
      <Text>
        {renderWithCursor('', placeholder, mask, showCursor, isFocused, 0, 0, false)}
      </Text>
    );
  }

  if (originalValue.length <= availableWidth) {
    return (
      <Text>
        {renderWithCursor(
          originalValue,
          '',
          mask,
          showCursor,
          isFocused,
          cursorOffset,
          cursorWidth,
          highlightPastedText,
        )}
      </Text>
    );
  }

  // Text is wider than available width — virtual scroll.
  const visibleW = Math.max(1, availableWidth - 2);
  const maxScroll = Math.max(0, originalValue.length - visibleW);
  const windowStart = Math.max(0, Math.min(scrollOffset, maxScroll));
  const windowText = originalValue.slice(windowStart, windowStart + visibleW);
  const localCursor = cursorOffset - windowStart;

  const textRendered = renderWithCursor(
    windowText,
    '',
    mask,
    showCursor,
    isFocused,
    localCursor,
    cursorWidth,
    highlightPastedText,
  );

  const leftIndicator = windowStart > 0 ? chalk.grey('←') : '';
  const rightIndicator = windowStart + visibleW < originalValue.length ? chalk.grey('→') : '';

  return <Text>{leftIndicator + textRendered + rightIndicator}</Text>;
}

/**
 * Uncontrolled text input component that manages its own internal state.
 */
export function UncontrolledTextInput({
  initialValue = '',
  ...props
}: UncontrolledTextInputProps) {
  const [value, setValue] = useState(initialValue);

  const handleChange = (newVal: string) => {
    setValue(newVal);
  };

  return (
    <TextInput
      {...props}
      value={value}
      onChange={handleChange}
    />
  );
}
