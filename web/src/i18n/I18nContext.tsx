import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  LOCALE_OPTIONS,
  MESSAGES,
  type LocaleCode,
} from './locales';
import { I18nContext, type I18nContextValue } from './useI18n';

const STORAGE_KEY = 'collima.locale';

function normalizeLocaleTag(tag: string | null | undefined): LocaleCode | null {
  if (!tag) return null;
  const lower = tag.trim().toLowerCase();
  if (!lower) return null;

  if (
    lower === 'zh-tw' ||
    lower === 'zh-hk' ||
    lower === 'zh-mo' ||
    lower.startsWith('zh-hant')
  ) {
    return 'zh-TW';
  }
  if (lower === 'zh' || lower.startsWith('zh-')) {
    return 'zh-CN';
  }
  if (lower === 'ja' || lower.startsWith('ja-')) {
    return 'ja';
  }
  if (lower === 'en' || lower.startsWith('en-')) {
    return 'en';
  }
  return null;
}

function detectInitialLocale(): LocaleCode {
  if (typeof window === 'undefined') {
    return 'zh-CN';
  }

  try {
    const urlLang = new URLSearchParams(window.location.search).get('lang');
    const fromUrl = normalizeLocaleTag(urlLang);
    if (fromUrl) return fromUrl;
  } catch {
    // Ignore URL parsing errors
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (
      saved &&
      LOCALE_OPTIONS.some((opt) => opt.code === (saved as LocaleCode))
    ) {
      return saved as LocaleCode;
    }
  } catch {
    // Ignore localStorage access restrictions
  }

  const navLangs =
    typeof navigator !== 'undefined'
      ? [...(navigator.languages ?? []), navigator.language]
      : [];
  for (const candidate of navLangs) {
    const matched = normalizeLocaleTag(candidate);
    if (matched) return matched;
  }

  return 'en';
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [locale, setLocaleState] = useState<LocaleCode>(detectInitialLocale);

  const setLocale = useCallback((next: LocaleCode) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage quota / privacy mode errors
    }
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('lang')) {
        url.searchParams.set('lang', next);
        window.history.replaceState(null, '', url.toString());
      }
    } catch {
      // Ignore history API restrictions
    }
  }, []);

  const t = MESSAGES[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t.windowTitle;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', t.metaDescription);
    }

    if ('__TAURI_INTERNALS__' in window) {
      void getCurrentWindow()
        .setTitle(t.windowTitle)
        .catch(() => {
          // Ignore if window title permission is unavailable
        });
    }
  }, [locale, t]);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};
