import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'confirm-dialog',
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: true,
  },
});
