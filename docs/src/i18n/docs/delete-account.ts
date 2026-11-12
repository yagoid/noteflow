// Entry point for the /delete-account page dictionary (mirrors src/i18n/docs/privacy.ts).
import { deleteAccountEn } from './delete-account.en';
import { deleteAccountEs } from './delete-account.es';
import type { Lang } from '../types';
import type { LegalContent } from './legal';

export function getDeleteAccountContent(lang: Lang): LegalContent {
  return lang === 'es' ? deleteAccountEs : deleteAccountEn;
}
