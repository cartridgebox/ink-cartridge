import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'blots-editor',
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: true,
  },
});
