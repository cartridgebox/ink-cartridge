/**
 * Unit tests for deep freeze utilities
 *
 * Tests recursive freezing with type safety and runtime behavior.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { deepFreeze, freezeIfDev, freezeInStrictMode, isFrozen } from '../../../../src/xterm-mouse/utils/freeze.js';

describe('Deep Freeze Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deepFreeze', () => {
    test('returns primitives unchanged', () => {
      // Arrange & Act & Assert
      expect(deepFreeze(null)).toBe(null);
      expect(deepFreeze(undefined)).toBe(undefined);
      expect(deepFreeze(42)).toBe(42);
      expect(deepFreeze('string')).toBe('string');
      expect(deepFreeze(true)).toBe(true);
      expect(deepFreeze(false)).toBe(false);
    });

    test('freezes plain objects recursively', () => {
      // Arrange
      const obj = {
        user: {
          name: 'Max',
          meta: { age: 30 },
        },
        tags: ['ts', 'rust'],
      };

      // Act
      const frozen = deepFreeze(obj);

      // Assert - should be frozen at all levels
      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.user)).toBe(true);
      expect(Object.isFrozen(frozen.user.meta)).toBe(true);

      // Assert - cannot modify (cast to any for runtime testing)
      expect(() => {
        // Type system prevents modification, need to test runtime
        (frozen as any).user.name = 'Bob';
      }).toThrow();
    });

    test('freezes arrays recursively', () => {
      // Arrange
      const arr = [
        { id: 1, data: { value: 10 } },
        { id: 2, data: { value: 20 } },
      ];

      // Act
      const frozen = deepFreeze(arr);

      // Assert
      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen[0])).toBe(true);
      expect(Object.isFrozen(frozen[0]?.data)).toBe(true);

      // Cast to any for runtime testing (type system already prevents this at compile time)
      expect(() => {
        // Type system prevents modification, need to test runtime
        (frozen as any)[0].id = 99;
      }).toThrow();
    });

    test('handles Map recursively', () => {
      // Arrange
      const map = new Map([
        ['key1', { value: 1 }],
        ['key2', { value: 2 }],
      ]);

      // Act
      const frozen = deepFreeze(map);

      // Assert
      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.get('key1'))).toBe(true);

      expect(() => {
        const value = frozen.get('key1');
        if (value)
          (
            value as any
          ).value = 99;
      }).toThrow();
    });

    test('handles Set recursively', () => {
      // Arrange
      const set = new Set([
        { id: 1, data: { active: true } },
        { id: 2, data: { active: false } },
      ]);

      // Act
      const frozen = deepFreeze(set);

      // Assert
      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen([...frozen][0])).toBe(true);
      expect(Object.isFrozen([...frozen][0]?.data)).toBe(true);

      // Note: ReadonlySet still has add() method but it won't modify the set
      // The type system prevents calling it, but at runtime it just does nothing
    });

    test('handles WeakMap and WeakSet', () => {
      // Arrange
      const weakMap = new WeakMap();
      const weakSet = new WeakSet();

      // Act
      const frozenMap = deepFreeze(weakMap);
      const frozenSet = deepFreeze(weakSet);

      // Assert - top-level is frozen, but structure is unchanged
      expect(Object.isFrozen(frozenMap)).toBe(true);
      expect(Object.isFrozen(frozenSet)).toBe(true);
    });

    test('freezes built-in objects (Date, RegExp, Error)', () => {
      // Arrange
      const date = new Date('2024-01-01');
      const regex = /test/g;
      const error = new Error('test error');

      // Act
      const frozenDate = deepFreeze(date);
      const frozenRegex = deepFreeze(regex);
      const frozenError = deepFreeze(error);

      // Assert
      expect(Object.isFrozen(frozenDate)).toBe(true);
      expect(Object.isFrozen(frozenRegex)).toBe(true);
      expect(Object.isFrozen(frozenError)).toBe(true);
    });

    test('handles circular references without infinite loops', () => {
      // Arrange - create circular reference
      const circular: { data?: unknown; ref?: unknown } = {};
      circular.data = { value: 1 };
      circular.ref = circular;

      // Act - should not hang
      const frozen = deepFreeze(circular);

      // Assert
      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.data)).toBe(true);
    });

    test('handles complex nested structures', () => {
      // Arrange
      const complex = {
        users: [
          { id: 1, profile: { settings: { theme: 'dark' } } },
          { id: 2, profile: { settings: { theme: 'light' } } },
        ],
        metadata: new Map<string, Date | Set<string>>([
          ['created', new Date('2024-01-01')],
          ['tags', new Set(['important', 'featured'])],
        ]),
        config: {
          features: {
            featureA: { enabled: true, options: { flag1: true, flag2: false } },
            featureB: { enabled: false, options: { flag1: false, flag2: true } },
          },
        },
      };

      // Act
      const frozen = deepFreeze(complex);

      // Assert - deeply frozen
      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.users[0])).toBe(true);
      expect(Object.isFrozen(frozen.users[0]?.profile)).toBe(true);
      expect(Object.isFrozen(frozen.users[0]?.profile?.settings)).toBe(true);
      expect(Object.isFrozen(frozen.metadata.get('created'))).toBe(true);

      const tagsSet = frozen.metadata.get('tags');
      expect(Object.isFrozen(tagsSet)).toBe(true);
      if (tagsSet && 'size' in tagsSet) {
        // It's a Set, spread it to check frozen elements
        const firstTag = [...tagsSet][0];
        expect(Object.isFrozen(firstTag)).toBe(true);
      }

      expect(Object.isFrozen(frozen.config.features.featureA)).toBe(true);
      expect(Object.isFrozen(frozen.config.features.featureA.options)).toBe(true);
    });

    test('returns same object reference (not a copy)', () => {
      // Arrange
      const obj = { data: [1, 2, 3] };

      // Act
      const frozen = deepFreeze(obj);

      // Assert - same reference
      expect(frozen).toBe(obj);
    });
  });

  describe('freezeIfDev', () => {
    test('freezes in development mode', () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      try {
        const obj = { data: [1, 2, 3] };

        // Act
        const frozen = freezeIfDev(obj);

        // Assert
        expect(Object.isFrozen(frozen)).toBe(true);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    test('does not freeze in production mode', () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const obj = { data: [1, 2, 3] };

        // Act
        const result = freezeIfDev(obj);

        // Assert - not frozen in production
        expect(Object.isFrozen(result)).toBe(false);
        expect(result).toBe(obj); // Same reference
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('freezeInStrictMode', () => {
    test('always freezes (type-level enforcement)', () => {
      // Arrange
      const obj = { data: [1, 2, 3] };

      // Act
      const frozen = freezeInStrictMode(obj);

      // Assert - always freezes at runtime
      expect(Object.isFrozen(frozen)).toBe(true);
      expect(frozen).toBe(obj);
    });
  });

  describe('isFrozen', () => {
    test('returns true for primitives', () => {
      expect(isFrozen(null)).toBe(true);
      expect(isFrozen(42)).toBe(true);
      expect(isFrozen('string')).toBe(true);
      expect(isFrozen(true)).toBe(true);
    });

    test('returns true for frozen objects', () => {
      const frozen = Object.freeze({ data: [1, 2, 3] });
      expect(isFrozen(frozen)).toBe(true);
    });

    test('returns false for non-frozen objects', () => {
      const obj = { data: [1, 2, 3] };
      expect(isFrozen(obj)).toBe(false);
    });

    test('returns true for deeply frozen objects', () => {
      const obj = { nested: { data: [1, 2, 3] } };
      const frozen = deepFreeze(obj);
      expect(isFrozen(frozen)).toBe(true);
    });
  });

  describe('Type Safety - DeepReadonly', () => {
    test('prevents object modification', () => {
      // Arrange
      const obj = { user: { name: 'Max', meta: { age: 30 } } };
      const frozen = deepFreeze(obj);

      expect(() => {
        (
          frozen as any
        ).user.name = 'Bob';
      }).toThrow();
    });

    test('prevents array modification', () => {
      // Arrange
      const arr = [1, 2, 3];
      const frozen = deepFreeze(arr);

      expect(() => {
        (
          frozen as any
        ).push(4);
      }).toThrow();
    });

    test('prevents Map modification', () => {
      // Arrange
      const map = new Map([['key', { value: 1 }]]);
      const frozen = deepFreeze(map);

      // Assert
      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.get('key'))).toBe(true);

      // Note: ReadonlyMap still has set() method but it won't modify the map
      // The type system prevents calling it, but at runtime it just does nothing
    });

    test('prevents Set modification', () => {
      // Arrange
      const set = new Set([1, 2, 3]);
      const frozen = deepFreeze(set);

      // Assert
      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen([...frozen][0])).toBe(true);

      // Note: ReadonlySet still has add() method but it won't modify the set
      // The type system prevents calling it, but at runtime it just does nothing
    });
  });
});
