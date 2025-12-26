/**
 * Language Configuration
 * Supported languages: English (en), Turkish (tr)
 */

export type SupportedLanguage = 'en' | 'tr';

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['en', 'tr'];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

/**
 * Maps our language codes to TMDB language codes
 */
export const TMDB_LANGUAGE_MAP: Record<SupportedLanguage, string> = {
    en: 'en-US',
    tr: 'tr-TR'
};

/**
 * Get TMDB language code from our language code
 */
export function getTMDBLanguage(lang: string | undefined): string {
    if (lang && lang in TMDB_LANGUAGE_MAP) {
        return TMDB_LANGUAGE_MAP[lang as SupportedLanguage];
    }
    return TMDB_LANGUAGE_MAP[DEFAULT_LANGUAGE];
}

/**
 * Validate if a language code is supported
 */
export function isValidLanguage(lang: string | undefined): lang is SupportedLanguage {
    return lang !== undefined && SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage);
}
