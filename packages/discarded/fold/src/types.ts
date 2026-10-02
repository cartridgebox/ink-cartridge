import React from "react";

export interface FoldProps {
  /** Focus target for the fold header bar. */
  focusId: string;
  /** Label shown on the header bar. */
  label: string;
  /** Optional preview content displayed when folded. */
  preview?: React.ReactNode;
  /** Content rendered when the fold is expanded. */
  children: React.ReactNode;
  /** Controlled: expanded state. */
  expanded?: boolean;
  /** Controlled: called when expand state is toggled. */
  onToggle?: () => void;
  /** Uncontrolled: initial expanded state. Defaults to false. */
  defaultExpanded?: boolean;
}
