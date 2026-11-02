import { describe, expect, it } from 'vitest';
import { checkValuesFor, isPhone, isSaIdNumber, luhn, piiByName, piiByShape } from '../../src/index.js';
import { parseArgs } from '../../src/args.js';
import { stableJson } from '../../src/files.js';

describe('PII detection (MO-107)', () => {
  it.each(['email', 'contact_email', 'emailAddress', 'phone', 'mobile', 'cell', 'id_number', 'passport_no', 'home_address', 'dob', 'date_of_birth', 'salary', 'bank_account', 'tax_number'])('flags %s by name', (n) => {
    expect(piiByName(n).pii).toBe(true);
  });
  it.each(['name', 'stage', 'owner_id', 'value_zar', 'created_at', 'cellar_count'])('does not flag %s', (n) => {
    expect(piiByName(n).pii).toBe(false);
  });
  it('flags by shape', () => {
    expect(piiByShape({ nullRatio: 0, distinct: 5, min: null, max: null, top: null, shape: { email: 9, phone: 0, saId: 0, url: 0, checked: 10 } }).kind).toBe('email');
    expect(piiByShape({ nullRatio: 0, distinct: 5, min: null, max: null, top: null, shape: { email: 0, phone: 1, saId: 0, url: 0, checked: 10 } }).pii).toBe(false);
  });
  it('validates SA ID numbers with Luhn', () => {
    expect(luhn('8001015009087')).toBe(true);
    expect(isSaIdNumber('8001015009087')).toBe(true);
    expect(isSaIdNumber('8001015009088')).toBe(false);
    expect(isSaIdNumber('8013015009087')).toBe(false);
  });
  it('recognises SA and E.164 phones', () => {
    expect(isPhone('+27 82 555 1000')).toBe(true);
    expect(isPhone('082 555 1000')).toBe(true);
    expect(isPhone('12345')).toBe(false);
  });
});

describe('check constraint values', () => {
  it('parses ANY(ARRAY[...]) and IN (...)', () => {
    expect(checkValuesFor('status', ["CHECK ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'done'::text])))"])).toEqual(['todo', 'in_progress', 'done']);
    expect(checkValuesFor('role', ["CHECK (role IN ('rep', 'sales_manager'))"])).toEqual(['rep', 'sales_manager']);
    expect(checkValuesFor('status', ['CHECK ((total > 0))'])).toBeNull();
  });
});

describe('args and files', () => {
  it('parses flags', () => {
    expect(parseArgs(['init', '--yes', '--url', 'postgres://x', '--dry-run'])).toEqual({ command: 'init', flags: { yes: true, url: 'postgres://x', 'dry-run': true }, positional: [] });
    expect(parseArgs(['mcp', 'login', '-y']).positional).toEqual(['login']);
  });
  it('writes stable JSON', () => {
    expect(stableJson({ widgets: [], id: 'x', specVersion: 0, $schema: 's' })).toBe('{\n  "$schema": "s",\n  "specVersion": 0,\n  "id": "x",\n  "widgets": []\n}\n');
  });
});
