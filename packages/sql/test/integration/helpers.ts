import { loadProject, type MorphProject } from '@morph-reports/spec';
import { createFixtureDb, fixtureSpecs, type FixtureDb, type FixtureName } from '@morph-reports/testkit';
import { generateMigration } from '../../src/index.js';

export interface MigratedFixture {
  db: FixtureDb;
  project: MorphProject;
}

/** A fresh copy of a fixture with the Morph migration applied. */
export async function migratedFixture(name: FixtureName): Promise<MigratedFixture> {
  const db = await createFixtureDb(name);
  const project = loadProject(fixtureSpecs(name));
  await db.exec(generateMigration(project));
  return { db, project };
}

export const CRM = {
  ubuntu: '30000000-0000-4000-8000-000000000001', // Thandi, proposal
  karoo: '30000000-0000-4000-8000-000000000002', // Pieter, qualified
  soweto: '30000000-0000-4000-8000-000000000004', // Sipho, lead
  durban: '30000000-0000-4000-8000-000000000006', // Sipho, proposal
  limpopo: '30000000-0000-4000-8000-000000000007', // Sipho, lead
  thandi: '00000000-0000-4000-8000-000000000001',
  sipho: '00000000-0000-4000-8000-000000000002',
  ayesha: '00000000-0000-4000-8000-000000000003',
  pieter: '00000000-0000-4000-8000-000000000004',
};
