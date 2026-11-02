import { createTranslator } from '@morph-reports/spec';
import en from './locales/en.json' with { type: 'json' };

export type MessageKey = keyof typeof en;
export const messages = en;
export const t = createTranslator(en);
export function makeT(overrides?: Partial<Record<MessageKey, string>>) {
  return overrides ? createTranslator({ ...en, ...overrides }) : t;
}
export type T = ReturnType<typeof makeT>;
