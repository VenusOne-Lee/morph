import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTranslator } from '@morph-reports/spec';

const here = dirname(fileURLToPath(import.meta.url));
const messages = JSON.parse(readFileSync(join(here, '..', 'locales', 'en.json'), 'utf8')) as Record<string, string>;
export const t = createTranslator(messages);
