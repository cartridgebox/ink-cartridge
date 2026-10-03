import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'blots-editor',
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: true,
    // Force ANSI colors so a test can assert the focused-pane border; every
    // other test strips ANSI via `stripAnsi`, so enabling colors is inert.
    env: { FORCE_COLOR: '1' },
  },
});
