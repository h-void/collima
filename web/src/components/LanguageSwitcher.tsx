import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { useI18n } from '../i18n/useI18n';
import { LOCALE_OPTIONS } from '../i18n/locales';

export const LanguageSwitcher: React.FC = () => {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const activeOpt =
    LOCALE_OPTIONS.find((opt) => opt.code === locale) ?? LOCALE_OPTIONS[0];

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="lang-switcher">
      <button
        id="btn-language-switcher"
        type="button"
        aria-label={t.langMenuAriaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="btn-instrument lang-switcher-trigger"
      >
        <Globe size={14} className="text-[var(--accent-amber)]" />
        <span>{activeOpt.shortLabel}</span>
        <ChevronDown
          size={12}
          className={`text-[var(--text-muted)] transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          id="menu-language-options"
          role="listbox"
          aria-label={t.langMenuAriaLabel}
          className="lang-switcher-menu"
        >
          {LOCALE_OPTIONS.map((opt) => {
            const selected = opt.code === locale;
            return (
              <button
                key={opt.code}
                id={`btn-lang-opt-${opt.code}`}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setLocale(opt.code);
                  setOpen(false);
                }}
                className={`lang-switcher-option ${
                  selected ? 'is-selected' : ''
                }`}
              >
                <span>{opt.nativeLabel}</span>
                {selected && (
                  <Check size={13} className="text-[var(--accent-amber)]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
