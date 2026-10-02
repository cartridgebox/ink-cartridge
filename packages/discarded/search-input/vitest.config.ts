import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'search-input',
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: true,
  },
});
