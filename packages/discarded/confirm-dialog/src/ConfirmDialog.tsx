import React, { useContext, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { useKeyboard, useFocusState } from 'ink-cartridge';
import { ModalLayerElementContext } from 'ink-cartridge';
import type { ConfirmDialogProps } from './types.js';

/**
 * A modal confirmation dialog with two buttons.
 *
 * Designed to be displayed inside a modal layer:
 *
 * ```tsx
 * const { openModalLayer, applyElementToModalLayer } = useScreenSystem();
 * openModalLayer('confirm', 100);
 * applyElementToModalLayer('confirm', {
 *   elementId: 'confirm-dialog',
 *   element: () => <ConfirmDialog ... />,
 * });
 * ```
 *
 * Keyboard:
 * - Tab / Shift+Tab — switch between buttons
 * - Enter — trigger focused button
 * - Esc — cancel
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { boundKeyboard, focusSet, focusUnregister } = useKeyboard();
  const modalCtx = useContext(ModalLayerElementContext);
  const elementId = modalCtx?.id;
  const confirmFocused = useFocusState('dialog-confirm', { element: elementId });
  const cancelFocused = useFocusState('dialog-cancel', { element: elementId });

  // Keep stable refs so the keyboard effect doesn't capture stale callbacks
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    // Esc 在任何按钮上都是取消（屏幕级绑定，不受 focus 影响）
    const unEsc = boundKeyboard(['escape'], () => onCancelRef.current(), {
      elementId,
    });

    const unConfirm = boundKeyboard(
      ['return'],
      () => onConfirmRef.current(),
      { elementId, focusId: 'dialog-confirm' },
    );

    const unCancel = boundKeyboard(
      ['return'],
      () => onCancelRef.current(),
      { elementId, focusId: 'dialog-cancel' },
    );

    focusSet('dialog-confirm', { element: elementId });

    return () => {
      unEsc();
      unConfirm();
      unCancel();
      focusUnregister('dialog-confirm', { element: elementId });
      focusUnregister('dialog-cancel', { element: elementId });
    };
  }, [boundKeyboard, elementId, focusSet, focusUnregister]);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold color="yellow">
          {'⚠ ' + title}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>{message}</Text>
      </Box>

      <Box justifyContent="flex-end" gap={2}>
        <Box>
          <Text
            color={cancelFocused ? 'cyan' : 'grey'}
            bold={cancelFocused}
            underline={cancelFocused}
          >
            {cancelLabel}
          </Text>
        </Box>

        <Box>
          <Text
            color={confirmFocused ? 'green' : 'grey'}
            bold={confirmFocused}
            underline={confirmFocused}
          >
            {confirmLabel}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
