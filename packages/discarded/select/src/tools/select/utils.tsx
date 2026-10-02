import React from 'react';
import { Text } from 'ink';
import type { Item } from '../../select/types.js';

/** Clamp a number between min and max (inclusive). */
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(n, max));
}

/** Default item renderer used by both SelectInput and SelectRow. */
export function defaultItem<T>(props: Item<T> & { isSelected: boolean }) {
  return <Text color={props.isSelected ? 'blue' : undefined}>{props.label}</Text>;
}
