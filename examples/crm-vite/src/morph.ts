// The crm fixture's generated specs. In your app these live in ./morph/.
import model from '../../../fixtures/crm/morph/model.json';
import actions from '../../../fixtures/crm/morph/actions.json';

export const reports = Object.values(import.meta.glob('../../../fixtures/crm/morph/reports/*.json', { eager: true, import: 'default' }));
export { model, actions };
