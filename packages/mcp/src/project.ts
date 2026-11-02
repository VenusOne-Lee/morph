import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject, MorphError, type MorphProject } from '@morph-reports/spec';

/** Reads morph/model.json, morph/actions.json and morph/reports/*.json from a project folder. */
export function readProject(cwd: string): MorphProject {
  const dir = join(cwd, 'morph');
  if (!existsSync(join(dir, 'model.json'))) {
    throw new MorphError('spec_invalid', `No morph/model.json in ${cwd}. Run \`npx morph-reports init\` first, or start the server from your app folder.`);
  }
  const read = (p: string) => JSON.parse(readFileSync(join(dir, p), 'utf8')) as unknown;
  const reports = existsSync(join(dir, 'reports'))
    ? readdirSync(join(dir, 'reports'))
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => read(join('reports', f)))
    : [];
  return loadProject({ model: read('model.json'), reports, actions: existsSync(join(dir, 'actions.json')) ? read('actions.json') : undefined });
}
