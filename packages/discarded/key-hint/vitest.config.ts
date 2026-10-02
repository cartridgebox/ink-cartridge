import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'key-hint',
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: true,
  },
});
