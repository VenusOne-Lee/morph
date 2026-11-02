import type { ActionsFile, MorphModel, ReportSpec } from './types.js';
import { MorphError } from './errors.js';
import { formatIssues, validateActions, validateModel, validateReport } from './validate.js';
import { migrateSpec } from './version.js';

export interface MorphProject {
  model: MorphModel;
  reports: ReportSpec[];
  actions: ActionsFile;
}

/** Validates and normalises the three spec files. Throws a MorphError on the first bad file. */
export function loadProject(input: { model: unknown; reports: unknown[]; actions?: unknown }): MorphProject {
  const model = migrateSpec(input.model as MorphModel, 'model');
  const mv = validateModel(model);
  if (!mv.ok) throw new MorphError('model_invalid', `morph/model.json is not valid.\n${formatIssues(mv.issues)}`, { hint: 'Re-run `morph scan`.', details: mv.issues });
  const actions = migrateSpec((input.actions ?? { specVersion: 0, undoDays: 30, actions: [] }) as ActionsFile, 'actions file');
  const av = validateActions(actions, model);
  if (!av.ok) throw new MorphError('actions_invalid', `morph/actions.json is not valid.\n${formatIssues(av.issues)}`, { hint: 'Re-run `morph scan` or fix the file.', details: av.issues });
  const reports = input.reports.map((r) => {
    const spec = migrateSpec(r as ReportSpec, 'report');
    if (spec.broken) return spec;
    const rv = validateReport(spec, model, actions);
    if (!rv.ok) throw new MorphError('spec_invalid', `Report "${spec.id}" is not valid.\n${formatIssues(rv.issues)}`, { hint: 'Fix the spec or run `morph scan`.', details: rv.issues });
    return spec;
  });
  return { model, reports, actions };
}
