import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import {
  actionInfo,
  compileQuery,
  fetchReportRows,
  isMorphError,
  loadProject,
  MorphError,
  undoAction,
  type ApplyResult,
  type MorphProject,
  type RuntimeFilter,
  type SupabaseLike,
  type UndoResult,
} from '@morph-reports/spec';
import { buildMeta, DEFAULT_CONFIG, type MorphConfig, type ReportMeta, type Row } from './meta.js';
import { injectStyles } from './styles.js';
import { resolveTheme, type HostTheme, type MorphTheme, type ThemePreset } from './theme.js';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
import { makeT, type MessageKey, type T } from './i18n.js';
import { nounFor, PreviewModal, type PreviewRequest } from './components/PreviewModal.js';
import { Toasts, type ToastItem } from './components/Toast.js';

/* ------------------------------------------------------------------ */
/* Report store: one per report + filters, shared by every widget      */
/* ------------------------------------------------------------------ */

export interface ReportState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  rows: Row[];
  capped: boolean;
  error: MorphError | null;
  fetchedAt: number;
}

const CACHE_MS = 60_000;

class ReportStore {
  state: ReportState = { status: 'idle', rows: [], capped: false, error: null, fetchedAt: 0 };
  private listeners = new Set<() => void>();
  private inflight: Promise<void> | null = null;
  private controller: AbortController | null = null;

  constructor(
    readonly meta: ReportMeta,
    readonly filters: RuntimeFilter[],
    private readonly client: () => SupabaseLike,
    private readonly cap: number,
  ) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
      if (this.listeners.size === 0) this.controller?.abort();
    };
  };
  getSnapshot = () => this.state;
  private set(s: Partial<ReportState>) {
    this.state = { ...this.state, ...s };
    this.listeners.forEach((l) => l());
  }

  /** Dedupes identical requests; serves the cache for 60s unless forced. */
  load(force = false): Promise<void> {
    if (this.inflight) return this.inflight;
    if (!force && this.state.status === 'ready' && Date.now() - this.state.fetchedAt < CACHE_MS) return Promise.resolve();
    this.controller = new AbortController();
    if (this.state.status !== 'ready') this.set({ status: 'loading', error: null });
    this.inflight = fetchReportRows(this.client(), compileQuery(this.meta.resolved, this.filters), { cap: this.cap, signal: this.controller.signal })
      .then((r) => this.set({ status: 'ready', rows: r.rows, capped: r.capped, error: null, fetchedAt: Date.now() }))
      .catch((e: unknown) => {
        const err = isMorphError(e) ? e : new MorphError('unknown', (e as Error).message ?? String(e));
        this.set({ status: 'error', error: err });
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export interface ActionEvent {
  type: 'applied' | 'undone' | 'failed';
  auditId?: string;
  action: string;
  rows: string[];
  error?: MorphError;
}

export interface MorphContextValue {
  project: MorphProject;
  client: SupabaseLike;
  config: MorphConfig;
  t: T;
  viewer: { id: string | null; name: string | null };
  meta(reportId: string): ReportMeta;
  store(reportId: string, filters?: RuntimeFilter[]): ReportStore;
  refreshSource(table: string): void;
  canAct(actionId: string): boolean | null;
  openPreview(req: PreviewRequest): void;
  undo(auditId: string, opts?: { partial?: boolean }): Promise<UndoResult | null>;
  flash: Map<string, 'apply' | 'undo'>;
  owners(entity: string, field: string, display: string | null): OwnerOption[] | null;
  dev: boolean;
}

export interface OwnerOption {
  id: string;
  name: string;
}

const Ctx = createContext<MorphContextValue | null>(null);

export interface MorphProviderProps {
  /** The app's supabase-js client, signed in as the viewer. Never a service-role client. */
  supabase: SupabaseLike;
  model: unknown;
  reports: unknown[];
  actions?: unknown;
  /**
   * How reports pick up the app's look. Default `auto`: read the host page (distinctUI,
   * shadcn/Tailwind variables, brand variables, the surrounding font) and fall back to
   * Morph's defaults. `morph` turns detection off, `distinctui` forces that preset, and an
   * object overrides single tokens on top: `{ accent: '#e11d48', barRadius: '2px' }`.
   */
  theme?: MorphTheme | ThemePreset;
  config?: Partial<MorphConfig>;
  messages?: Partial<Record<MessageKey, string>>;
  onAction?: (e: ActionEvent) => void;
  injectStyles?: boolean;
  /** Dev mode shows spec warnings and the `{ }` spec panel. */
  dev?: boolean;
  className?: string;
  children: ReactNode;
}

export function MorphProvider(props: MorphProviderProps) {
  const project = useMemo(() => loadProject({ model: props.model, reports: props.reports, actions: props.actions }), [props.model, props.reports, props.actions]);
  const config = useMemo(() => ({ ...DEFAULT_CONFIG, ...props.config }), [props.config]);
  const t = useMemo(() => makeT(props.messages), [props.messages]);
  const clientRef = useRef(props.supabase);
  clientRef.current = props.supabase;
  const onActionRef = useRef(props.onAction);
  onActionRef.current = props.onAction;

  const stores = useRef(new Map<string, ReportStore>());
  const metas = useRef(new Map<string, ReportMeta>());
  const [perm, setPerm] = useState<Record<string, boolean>>({});
  const permAsked = useRef(new Set<string>());
  const [ownerLists, setOwnerLists] = useState<Record<string, OwnerOption[]>>({});
  const ownersAsked = useRef(new Set<string>());
  const [preview, setPreview] = useState<PreviewRequest | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [flash, setFlash] = useState(new Map<string, 'apply' | 'undo'>());
  const [viewer, setViewer] = useState<{ id: string | null; name: string | null }>({ id: null, name: null });
  const rootRef = useRef<HTMLDivElement>(null);
  const [hostTheme, setHostTheme] = useState<HostTheme>({ source: 'none', darkHost: false, vars: {} });
  const themeKey = JSON.stringify(props.theme ?? null);

  useIsoLayoutEffect(() => {
    if (props.injectStyles !== false) injectStyles();
    const read = () => {
      const next = resolveTheme(props.theme, rootRef.current?.parentElement);
      setHostTheme((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    read();
    // Host styles can land after Morph mounts (lazy CSS, web fonts, a theme class on <html>).
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(read);
    mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    mo?.observe(document.head, { childList: true });
    window.addEventListener('load', read);
    void document.fonts?.ready.then(read);
    return () => {
      mo?.disconnect();
      window.removeEventListener('load', read);
    };
  }, [themeKey, props.injectStyles]);

  useEffect(() => {
    let live = true;
    (async () => {
      const s = await props.supabase.auth?.getSession();
      const id = s?.data.session?.user.id ?? null;
      let name: string | null = null;
      if (id) {
        const r = await props.supabase.rpc('morph__actor_name');
        if (!r.error && typeof r.data === 'string') name = r.data;
      }
      if (live) setViewer({ id, name });
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [props.supabase]);

  // New client (sign-in change) or new specs: drop caches.
  useEffect(() => {
    stores.current.clear();
    metas.current.clear();
    permAsked.current.clear();
    ownersAsked.current.clear();
    setPerm({});
    setOwnerLists({});
  }, [props.supabase, project]);

  const meta = useCallback(
    (id: string) => {
      let m = metas.current.get(id);
      if (!m) {
        const spec = project.reports.find((r) => r.id === id);
        if (!spec) throw new MorphError('unknown_report', `There's no report called "${id}".`, { hint: `Reports: ${project.reports.map((r) => r.id).join(', ')}` });
        m = buildMeta(project, spec, config);
        metas.current.set(id, m);
      }
      return m;
    },
    [project, config],
  );

  const store = useCallback(
    (id: string, filters: RuntimeFilter[] = []) => {
      const key = `${id}|${JSON.stringify(filters)}`;
      let s = stores.current.get(key);
      if (!s) {
        s = new ReportStore(meta(id), filters, () => clientRef.current, config.rowCap);
        stores.current.set(key, s);
      }
      return s;
    },
    [meta, config.rowCap],
  );

  const refreshSource = useCallback((table: string) => {
    for (const s of stores.current.values()) if (s.meta.spec.source === table) void s.load(true);
  }, []);

  const canAct = useCallback(
    (actionId: string) => {
      if (actionId in perm) return perm[actionId]!;
      if (!permAsked.current.has(actionId)) {
        permAsked.current.add(actionId);
        actionInfo(clientRef.current, actionId)
          .then((i) => setPerm((p) => ({ ...p, [actionId]: i.canAct })))
          .catch(() => setPerm((p) => ({ ...p, [actionId]: false })));
      }
      return null;
    },
    [perm],
  );

  const owners = useCallback(
    (entity: string, field: string, display: string | null) => {
      const key = `${entity}.${field}`;
      if (ownerLists[key]) return ownerLists[key]!;
      if (!ownersAsked.current.has(key)) {
        ownersAsked.current.add(key);
        const cols = display ? `${field},${display}` : field;
        Promise.resolve(clientRef.current.from(entity).select(cols).order(display ?? field, { ascending: true }).limit(500)).then((r) => {
          const list = ((r.data ?? []) as Row[]).map((x) => ({ id: String(x[field]), name: String(display ? (x[display] ?? x[field]) : x[field]) }));
          setOwnerLists((o) => ({ ...o, [key]: list }));
        });
      }
      return null;
    },
    [ownerLists],
  );

  const doFlash = useCallback((ids: string[], kind: 'apply' | 'undo') => {
    setFlash((f) => {
      const n = new Map(f);
      ids.forEach((id) => n.set(id, kind));
      return n;
    });
    setTimeout(() => {
      setFlash((f) => {
        const n = new Map(f);
        ids.forEach((id) => n.delete(id));
        return n;
      });
    }, 1600);
  }, []);

  const pushToast = useCallback((tst: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts) => [...ts.slice(-2), { ...tst, id }]);
    return id;
  }, []);
  const dismissToast = useCallback((id: string) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);

  const undoMeta = useRef(new Map<string, { action: string; table: string; ids: string[] }>());
  const undo = useCallback(
    async (auditId: string, opts: { partial?: boolean } = {}): Promise<UndoResult | null> => {
      const action = undoMeta.current.get(auditId);
      try {
        const r = await undoAction(clientRef.current, auditId, opts);
        if (action) {
          refreshSource(action.table);
          doFlash(action.ids, 'undo');
        }
        const tst: Omit<ToastItem, 'id'> = r.partial
          ? { message: t('toast.undonePartial', { count: r.restored, skipped: r.conflicts.length }) }
          : { message: t('toast.undone', { count: r.restored }) };
        pushToast(tst);
        onActionRef.current?.({ type: 'undone', auditId, action: action?.action ?? '', rows: action?.ids ?? [] });
        return r;
      } catch (e) {
        const err = isMorphError(e) ? e : new MorphError('unknown', String(e));
        if (err.code === 'conflict' && Array.isArray(err.details) && err.details.length) {
          const c = err.details[0] as { display?: string; changedBy?: string | null };
          pushToast({
            message: t('toast.undoConflict', { name: c.display ?? '', by: c.changedBy ? ` by ${c.changedBy}` : '' }),
            actionLabel: t('toast.undoRest'),
            onAction: () => void undo(auditId, { partial: true }),
            sticky: true,
          });
        } else pushToast({ message: err.message, tone: 'bad' });
        onActionRef.current?.({ type: 'failed', auditId, action: action?.action ?? '', rows: action?.ids ?? [], error: err });
        return null;
      }
    },
    [doFlash, pushToast, refreshSource, t],
  );

  const onApplied = useCallback(
    (req: PreviewRequest, res: ApplyResult, toLabel: string) => {
      const a = project.actions.actions.find((x) => x.id === req.actionId)!;
      const ids = res.rows.map((r) => r.id);
      undoMeta.current.set(res.auditId, { action: a.id, table: a.table, ids });
      setPreview(null);
      refreshSource(a.table);
      doFlash(ids, 'apply');
      pushToast({
        message: t(a.kind === 'set_enum' ? 'toast.moved' : 'toast.reassigned', { count: res.changed, to: toLabel, noun: nounFor(req.reportId ? meta(req.reportId).noun : 'rows', res.changed) }),
        actionLabel: t('toast.undo'),
        onAction: () => void undo(res.auditId),
      });
      onActionRef.current?.({ type: 'applied', auditId: res.auditId, action: a.id, rows: ids });
    },
    [project, refreshSource, doFlash, pushToast, t, undo, meta],
  );

  const value: MorphContextValue = useMemo(
    () => ({
      project,
      client: props.supabase,
      config,
      t,
      viewer,
      meta,
      store,
      refreshSource,
      canAct,
      openPreview: setPreview,
      undo,
      flash,
      owners,
      dev: !!props.dev,
    }),
    [project, props.supabase, config, t, viewer, meta, store, refreshSource, canAct, undo, flash, owners, props.dev],
  );

  return (
    <Ctx.Provider value={value}>
      <div ref={rootRef} className={`morph-root${props.className ? ` ${props.className}` : ''}`} data-morph-theme={hostTheme.source} style={hostTheme.vars as CSSProperties}>
        {props.children}
        {preview && <PreviewModal request={preview} onClose={() => setPreview(null)} onApplied={onApplied} onFailed={(e) => onActionRef.current?.({ type: 'failed', action: preview.actionId, rows: preview.ids, error: e })} />}
        <Toasts items={toasts} onDismiss={dismissToast} t={t} />
      </div>
    </Ctx.Provider>
  );
}

export function useMorph(): MorphContextValue {
  const v = useContext(Ctx);
  if (!v) throw new MorphError('unknown', 'Morph components must be inside <MorphProvider>.', { hint: 'Wrap your report in <MorphProvider supabase={supabase} model={model} reports={reports}>.' });
  return v;
}

export interface UseReportResult extends ReportState {
  meta: ReportMeta;
  refetch(): Promise<void>;
}

/** `useReport(id, filters)` (MO-403): rows fetched as the viewer, cached and shared. */
export function useReport(id: string, filters: RuntimeFilter[] = [], opts: { refreshInterval?: number } = {}): UseReportResult {
  const m = useMorph();
  const key = JSON.stringify(filters);
  const s = useMemo(() => m.store(id, filters), [m.store, id, key]);
  const state = useSyncExternalStore(s.subscribe, s.getSnapshot, s.getSnapshot);
  useEffect(() => {
    void s.load();
    if (!opts.refreshInterval) return;
    const h = setInterval(() => void s.load(true), opts.refreshInterval);
    return () => clearInterval(h);
  }, [s, opts.refreshInterval]);
  return { ...state, meta: s.meta, refetch: () => s.load(true) };
}
