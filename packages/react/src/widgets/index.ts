import type { ComponentType } from 'react';
import type { WidgetProps } from '../registry.js';
import { Kanban } from './Kanban.js';
import { Balancer } from './Balancer.js';
import { Queue } from './Queue.js';
import { KpiFix } from './KpiFix.js';
import { ColumnWidget, FunnelWidget, HeatmapWidget, KpiWidget, WorkloadWidget } from './charts.js';

export { Kanban, Balancer, Queue, KpiFix, ColumnWidget, FunnelWidget, HeatmapWidget, KpiWidget, WorkloadWidget };

/** Built-in renderers by widget type. `bar` and `table` render inside `<MorphReport>` itself. */
export const BUILTIN_WIDGETS: Record<string, ComponentType<WidgetProps>> = {
  kanban: Kanban,
  balancer: Balancer,
  queue: Queue,
  'kpi-fix': KpiFix,
  heatmap: HeatmapWidget,
  column: ColumnWidget,
  funnel: FunnelWidget,
  workload: WorkloadWidget,
  kpi: KpiWidget,
};
