import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'fold',
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: true,
  },
});
