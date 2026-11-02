import type { ComponentType } from 'react';
import type { ReportWidget, RuntimeFilter, WidgetType, WidgetView } from '@morph-reports/spec';
import { BUILTIN_WIDGETS } from './widgets/index.js';

export interface WidgetProps {
  report: string;
  widget: ReportWidget;
  /** Overrides the widget's own `view`. */
  view?: WidgetView | undefined;
  /** false hides actions; a list allows only those action ids. */
  actions?: boolean | string[] | undefined;
  filters?: RuntimeFilter[] | undefined;
  /** Rendered inside another panel (no frame of its own). */
  embedded?: boolean | undefined;
  className?: string | undefined;
}

const custom = new Map<string, ComponentType<WidgetProps>>();

/** Register a widget renderer. A registration replaces the built-in of the same type. */
export function registerWidget(type: WidgetType | (string & {}), component: ComponentType<WidgetProps>): void {
  custom.set(type, component);
}

export function getWidget(type: string): ComponentType<WidgetProps> | undefined {
  return custom.get(type) ?? (BUILTIN_WIDGETS as Record<string, ComponentType<WidgetProps>>)[type];
}

export function registeredWidgets(): string[] {
  return [...new Set([...Object.keys(BUILTIN_WIDGETS), ...custom.keys()])];
}
