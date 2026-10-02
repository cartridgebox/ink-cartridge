import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'spinner',
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: true,
  },
});
