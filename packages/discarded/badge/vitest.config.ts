import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'badge',
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: true,
  },
});
