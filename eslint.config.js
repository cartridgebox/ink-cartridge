import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

// Get the flat-config rules from eslint-plugin-react-hooks.
// The legacy `recommended` export has the rule list but uses the old
// `plugins: ["react-hooks"]` string format; we pluck the rules directly
// and register the plugin as a flat-config object below.
const hooksRules = reactHooks.configs.recommended.rules;

export default tseslint.config(
  // ── Global ignores ───────────────────────────────────────────
  {
    // `packages/discarded/**` holds archived, no-longer-maintained
    // component packages — excluded from lint alongside build/vitest/tsc.
    ignores: ['dist/**', 'node_modules/**', 'src/keyboard-engine/dist/**', 'packages/*/dist/**', 'packages/discarded/**'],
  },

  // ── Base recommended rulesets ─────────────────────────────────
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ── Main source files ─────────────────────────────────────────
  {
    files: ['src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    settings: {
      react: { version: '19.0' },
    },
    rules: {
      // React recommended (classic JSX transform compatible)
      ...reactPlugin.configs.flat.recommended.rules,

      // React Hooks — spread the full rule set, then override below
      ...hooksRules,

      // ── Project conventions (from CLAUDE.md) ──────────────────

      // TypeScript already checks props; prop-types are noise.
      'react/prop-types': 'off',

      // Classic JSX transform requires React in scope.
      'react/react-in-jsx-scope': 'error',

      // `any` must be justified with a comment — warn so it's visible.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Type assertions (`as`) must be justified — warn as a nudge.
      '@typescript-eslint/consistent-type-assertions': 'warn',

      // Terminal UIs write to stdout/stderr; console is the medium.
      'no-console': 'off',

      // Async iterator / class patterns legitimately alias `this`
      // for use inside returned plain-object methods.
      '@typescript-eslint/no-this-alias': 'off',

      // ── react-hooks v7 adjustments ────────────────────────────

      // Updating refs during render (ref.current = value) is a documented
      // React pattern used extensively in this project (focusIdRef,
      // submitFormRef, onCancelRef, etc.) — see CLAUDE.md "Focus target
      // lifecycle" and "Callback refs in empty-deps effects".
      'react-hooks/refs': 'off',

      // Hooks dependency arrays must be complete (CLAUDE.md).
      'react-hooks/exhaustive-deps': 'error',

      // Calling setState in effects is sometimes the right call (e.g.
      // resetting error state after focus-triggering side-effects, or
      // clamping cursor offset when external value shortens).
      // Warn so each case receives human review rather than blocking CI.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },

  // ── Test, example & dev files (relaxed for ergonomics) ────────
  {
    files: [
      'src/__tests__/**/*.{ts,tsx}',
      'examples/**/*.{ts,tsx}',

      'src/dev/**/*.{ts,tsx}',
      'src/keyboard-engine/tests/**/*.ts',
      'packages/*/tests/**/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      // Test helpers use require() for dynamic loading patterns.
      '@typescript-eslint/no-require-imports': 'off',
      // Terminal escape sequences are the medium in Ink tests.
      'no-control-regex': 'off',
      // Dev panels use inline quotes as terminal UI text.
      'react/no-unescaped-entities': 'off',
      // Test / dev components often need empty blocks (e.g. no-op stubs).
      'no-empty': 'off',
      // Test components intentionally simplify dependency arrays and
      // sometimes call setState in effects for assertions.
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      // Tests capture hooks into module-level refs for assertions
      // (kbRef.current = kb). v7 flags this as modifying a variable
      // defined outside a component.
      'react-hooks/immutability': 'off',
      // Tests reassign module-level let bindings to capture hook results
      // (screenSystemRef = useScreenSystem()).
      'react-hooks/globals': 'off',
      // Test helpers use empty destructuring and inline components
      // often lack display names.
      'no-empty-pattern': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'react/display-name': 'off',
      'react/no-children-prop': 'off',
      'prefer-const': 'off',
    },
  },
);
