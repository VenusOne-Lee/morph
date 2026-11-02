import { MorphError } from './errors.js';
import { SPEC_VERSION } from './types.js';

/**
 * Spec versioning (MO-209). Specs without `specVersion` are treated as v0.
 * Future versions fail with a clear message instead of rendering wrongly.
 */
export function migrateSpec<T extends { specVersion?: number }>(input: T, kind = 'spec'): T & { specVersion: typeof SPEC_VERSION } {
  const v = input.specVersion ?? 0;
  if (v > SPEC_VERSION) {
    throw new MorphError('spec_version', `This ${kind} uses spec version ${v}, but this Morph only knows version ${SPEC_VERSION}.`, {
      hint: 'Update the Morph packages to the latest version.',
    });
  }
  return { ...input, specVersion: SPEC_VERSION };
}
