import React, { useState, useMemo, useCallback } from 'react';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { LanguageContext } from './context.js';
import type { I18nContextValue, LanguageProviderProps } from './types.js';

function loadFromPath(dirPath: string): Record<string, Record<string, string>> {
  const resources: Record<string, Record<string, string>> = {};
  let files: string[];
  try {
    files = readdirSync(dirPath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[ink-cartridge] LanguageProvider failed to read directory "${dirPath}": ${msg}`,
    );
  }
  for (const file of files) {
    if (file.endsWith('.json')) {
      const lang = file.replace('.json', '');
      const fullPath = resolve(dirPath, file);
      let raw: string;
      try {
        raw = readFileSync(fullPath, 'utf-8');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `[ink-cartridge] LanguageProvider failed to read "${fullPath}": ${msg}`,
        );
      }
      try {
        resources[lang] = flatJSON(JSON.parse(raw));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `[ink-cartridge] LanguageProvider failed to parse "${file}" as JSON: ${msg}`,
        );
      }
    }
  }
  return resources;
}

function flatJSON(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      result[fullKey] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      result[fullKey] = String(value);
    } else if (Array.isArray(value)) {
      result[fullKey] = value.map((v) => String(v)).join(', ');
    } else if (typeof value === 'object' && value !== null) {
      Object.assign(result, flatJSON(value as Record<string, unknown>, fullKey));
    }
  }
  return result;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
}

/**
 * Context provider for internationalization (i18n).
 *
 * Loads translation resources either from a directory of `{locale}.json` files
 * (via the `path` prop) or from a pre-built inline object (via `resources`).
 *
 * Once mounted, descendant components can use the {@link useI18n} hook to
 * access the `t()` translation function, `setLanguage()` to switch locales,
 * and `getLanguages()` / `currentLanguage` for language discovery.
 *
 * Language switches trigger an immediate re-render of all consumer components.
 *
 * @example
 * ```tsx
 * <LanguageProvider path="./locales" defaultLanguage="en-US">
 *   <MyApp />
 * </LanguageProvider>
 * ```
 */
export function LanguageProvider({
  children,
  resources: inlineResources,
  path,
  defaultLanguage,
  fallbackLanguage,
  defaultContext,
}: LanguageProviderProps) {
  const rawResources = useMemo(() => {
    if (inlineResources) {
      const flat: Record<string, Record<string, string>> = {};
      for (const [lang, obj] of Object.entries(inlineResources)) {
        flat[lang] = flatJSON(obj);
      }
      return flat;
    }
    if (path) return loadFromPath(path);
    return {};
  }, [inlineResources, path]);

  // Overlay state for mergeLanguage — avoids mutating rawResources so that
  // setLanguage closures always see the latest language list.
  const [mergedResources, setMergedResources] = useState<Record<string, Record<string, string>> | null>(null);
  const effectiveResources = mergedResources ?? rawResources;

  // Counter bumped on every mergeLanguage call so consumers that depend on
  // the language list (e.g. useMemo over Object.keys) re-compute.
  const [, setMergeCounter] = useState(0);

  const languages = useMemo(() => Object.keys(effectiveResources), [effectiveResources]);

  const [lang, setLang] = useState<string>(
    defaultLanguage ?? languages[0] ?? 'en-US',
  );

  // Wrap in useMemo so currentResources is stable — avoids causing
  // the `t` useCallback (which depends on it) to recreate every render.
  const currentResources = useMemo(
    () => effectiveResources[lang] ?? {},
    [effectiveResources, lang],
  );

  const [defaultCtx, setDefaultCtx] = useState<string | undefined>(defaultContext);

  const t = useCallback(
    (key: string, options?: { params?: Record<string, string | number>; context?: string }): string => {
      const params = options?.params;
      const context = options?.context ?? defaultCtx;

      let value: string | undefined;

      // Context-aware lookup: first try key.<context>
      if (context) {
        const contextKey = `${key}.${context}`;
        value = currentResources[contextKey];
        if (value === undefined && fallbackLanguage) {
          const fb = effectiveResources[fallbackLanguage];
          if (fb) value = fb[contextKey];
        }
      }

      // Fall back to the base key if context lookup failed
      if (value === undefined) {
        value = currentResources[key];
        if (value === undefined && fallbackLanguage) {
          const fb = effectiveResources[fallbackLanguage];
          if (fb) value = fb[key];
        }
      }

      if (value === undefined) return key;
      return interpolate(value, params);
    },
    [currentResources, effectiveResources, fallbackLanguage, defaultCtx],
  );

  const setLanguage = useCallback(
    (newLang: string) => {
      if (effectiveResources[newLang]) {
        setLang(newLang);
      } else {
        throw new Error(
          `[ink-cartridge] Language "${newLang}" is not available. ` +
          `Available languages: ${languages.join(', ')}`,
        );
      }
    },
    [effectiveResources, languages],
  );

  const mergeLanguage = useCallback(
    (paths: string[]) => {
      const base = mergedResources ?? rawResources;
      const merged = { ...base };
      for (const dirPath of paths) {
        const incoming = loadFromPath(dirPath);
        for (const [langCode, flat] of Object.entries(incoming)) {
          merged[langCode] = { ...(merged[langCode] ?? {}), ...flat };
        }
      }
      setMergedResources(merged);
      setMergeCounter((n) => n + 1);
    },
    [mergedResources, rawResources],
  );

  const setDefaultContext = useCallback(
    (ctx?: string) => { setDefaultCtx(ctx); },
    [],
  );

  const getLanguages = useCallback(() => Object.keys(effectiveResources), [effectiveResources]);

  const ctx: I18nContextValue = useMemo(
    () => ({ t, setLanguage, setDefaultContext, getLanguages, mergeLanguage, currentLanguage: lang }),
    [t, setLanguage, setDefaultContext, getLanguages, mergeLanguage, lang],
  );

  return <LanguageContext.Provider value={ctx}>{children}</LanguageContext.Provider>;
}
