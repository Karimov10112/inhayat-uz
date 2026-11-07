"use client";

import { Moon, Sun } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { t, type Locale } from "../lib/translations";

export type { Locale };

type Preferences = {
  locale: Locale;
  dark: boolean;
  setLocale: (locale: Locale) => void;
  toggleDark: () => void;
  strings: typeof t[Locale];
};

const LocaleContext = createContext<Preferences | null>(null);

export function SitePreferences({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("uz");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const savedLocale = window.localStorage.getItem("lifebridge.locale");
    const savedTheme = window.localStorage.getItem("lifebridge.theme");
    if (savedLocale === "uz" || savedLocale === "ru" || savedLocale === "en") {
      setLocaleState(savedLocale);
    }
    setDark(savedTheme === "dark");
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    window.localStorage.setItem("lifebridge.locale", locale);
    window.localStorage.setItem("lifebridge.theme", dark ? "dark" : "light");
  }, [locale, dark]);

  return (
    <LocaleContext.Provider
      value={{
        locale,
        dark,
        setLocale: setLocaleState,
        toggleDark: () => setDark((value) => !value),
        strings: t[locale],
      }}
    >
      {children}
    </LocaleContext.Provider>
  );
}

export function useSitePreferences() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useSitePreferences must be used inside SitePreferences.");
  return value;
}

export function SitePreferencesControls({ className = "" }: { className?: string }) {
  const { locale, dark, setLocale, toggleDark } = useSitePreferences();
  return (
    <div className={`site-preferences ${className}`.trim()} aria-label="Site preferences">
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        aria-label="Language"
      >
        <option value="uz">O‘zbek</option>
        <option value="ru">Русский</option>
        <option value="en">English</option>
      </select>
      <button
        type="button"
        onClick={toggleDark}
        aria-label={dark ? "Light mode" : "Dark mode"}
      >
        {dark ? <Sun size={15} /> : <Moon size={15} />}
      </button>
    </div>
  );
}

export const translations = {
  uz: {
    how: t.uz.nav_how,
    centres: t.uz.nav_centres,
    budget: t.uz.nav_budget,
    help: t.uz.nav_help,
    login: t.uz.nav_login,
    clinics: t.uz.nav_clinics,
    start: t.uz.nav_start,
  },
  ru: {
    how: t.ru.nav_how,
    centres: t.ru.nav_centres,
    budget: t.ru.nav_budget,
    help: t.ru.nav_help,
    login: t.ru.nav_login,
    clinics: t.ru.nav_clinics,
    start: t.ru.nav_start,
  },
  en: {
    how: t.en.nav_how,
    centres: t.en.nav_centres,
    budget: t.en.nav_budget,
    help: t.en.nav_help,
    login: t.en.nav_login,
    clinics: t.en.nav_clinics,
    start: t.en.nav_start,
  },
} as const;
