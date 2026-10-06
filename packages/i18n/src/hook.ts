import { useContext } from 'react';
import { LanguageContext } from './context.js';
import type { I18nContextValue } from './types.js';

/**
 * Access the i18n API from within a component tree wrapped by
 * {@link LanguageProvider}.
 *
 * Returns `{ t, setLanguage, getLanguages, mergeLanguage, currentLanguage, setDefaultContext }`.
 *
 * Must be used inside `<LanguageProvider>`. Throws with a clear error
 * message if no provider is found in the component tree.
 *
 * @example
 * ```tsx
 * function Greeting() {
 *   const { t, setLanguage } = useI18n();
 *   return <Text>{t('hello')}</Text>;
 * }
 * ```
 */
export function useI18n(): I18nContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error(
      '[ink-cartridge] useI18n() must be called inside a <LanguageProvider>.',
    );
  }
  return ctx;
}
