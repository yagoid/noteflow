// Entry point for the /legal-notice page dictionary (mirrors src/i18n/docs/terms.ts).
import { legalNoticeEn } from './legal-notice.en';
import { legalNoticeEs } from './legal-notice.es';
import type { Lang } from '../types';
import type { LegalContent } from './legal';

export function getLegalNoticeContent(lang: Lang): LegalContent {
  return lang === 'es' ? legalNoticeEs : legalNoticeEn;
}
