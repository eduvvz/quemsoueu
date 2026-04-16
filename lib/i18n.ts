import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';

import categoriesEn from '@/locales/categories/en.json';
import categoriesEs from '@/locales/categories/es.json';
import categoriesPt from '@/locales/categories/pt.json';
import categoryItemsEn from '@/locales/category-items/en.json';
import categoryItemsEs from '@/locales/category-items/es.json';
import categoryItemsPt from '@/locales/category-items/pt.json';
import uiEn from '@/locales/ui/en.json';
import uiEs from '@/locales/ui/es.json';
import uiPt from '@/locales/ui/pt.json';

type SupportedLocale = 'en' | 'es' | 'pt';

const translations = {
  en: {
    ...uiEn,
    ...categoriesEn,
    ...categoryItemsEn,
  },
  es: {
    ...uiEs,
    ...categoriesEs,
    ...categoryItemsEs,
  },
  pt: {
    ...uiPt,
    ...categoriesPt,
    ...categoryItemsPt,
  },
};

function resolveLocale(): SupportedLocale {
  const deviceLocale = getLocales()[0]?.languageCode?.toLowerCase();

  if (deviceLocale === 'pt' || deviceLocale === 'es') {
    return deviceLocale;
  }

  return 'en';
}

export const i18n = new I18n(translations);

i18n.enableFallback = true;
i18n.defaultLocale = 'en';
i18n.locale = resolveLocale();

export function t(key: string, options?: Record<string, unknown>) {
  return i18n.t(key, options);
}

export function getLocale() {
  return i18n.locale;
}
