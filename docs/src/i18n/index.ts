// i18n entry point for the marketing site. English is the default locale and the
// source of the content type; Spanish must satisfy the same shape.
import { en } from './en';
import { es } from './es';

export type { Content } from './en';
export type { Lang } from './types';

import type { Lang } from './types';

export function getContent(lang: Lang) {
  return lang === 'es' ? es : en;
}
