import type { ColumnStats } from './sample.js';

/** Name hints for PII (MO-107). Matched on word boundaries in snake/camel case. */
const PII_NAME = /(^|_)(e?mail(_address)?|phone|mobile|cell|tel|telephone|id_number|idnumber|national_id|sa_id|passport|address|street|postcode|postal_code|zip|dob|birth(day|date|_date)?|date_of_birth|salary|wage|bank|iban|account_number|acc_no|tax|tax_number|vat_number|ssn|social_security|ip_address|password|secret|token)(_|$)/i;

export interface PiiVerdict {
  pii: boolean;
  reason: string | null;
  kind: 'email' | 'phone' | 'sa_id_number' | 'other' | null;
}

export function snake(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

export function piiByName(column: string): PiiVerdict {
  const n = snake(column);
  const m = PII_NAME.exec(n);
  if (!m) return { pii: false, reason: null, kind: null };
  const word = m[2]!.toLowerCase();
  const kind = /mail/.test(word) ? 'email' : /phone|mobile|cell|tel/.test(word) ? 'phone' : /id_number|idnumber|sa_id|national_id/.test(word) ? 'sa_id_number' : 'other';
  return { pii: true, reason: `name contains "${word}"`, kind };
}

export function piiByShape(stats: ColumnStats | undefined): PiiVerdict {
  const s = stats?.shape;
  if (!s || s.checked === 0) return { pii: false, reason: null, kind: null };
  const share = (n: number) => n / s.checked;
  if (share(s.email) >= 0.6) return { pii: true, reason: `${Math.round(share(s.email) * 100)}% of sampled values look like email addresses`, kind: 'email' };
  if (share(s.saId) >= 0.6) return { pii: true, reason: `${Math.round(share(s.saId) * 100)}% of sampled values are valid SA ID numbers`, kind: 'sa_id_number' };
  if (share(s.phone) >= 0.6) return { pii: true, reason: `${Math.round(share(s.phone) * 100)}% of sampled values look like phone numbers`, kind: 'phone' };
  return { pii: false, reason: null, kind: null };
}
