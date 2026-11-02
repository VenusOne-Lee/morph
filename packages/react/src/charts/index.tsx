import { formatCompact, niceTicks } from '@morph-reports/spec';

/**
 * Small SVG chart layer (no chart library in v0.1). Every interactive mark
 * is a focusable button with an aria-label, so charts work by keyboard.
 */

export interface StackedBar {
  key: string;
  label: string;
  sub?: string;
  /** Moving part (accent) and stuck part (bad). */
  a: number;
  b: number;
  ariaLabel: string;
}

const ACC = 'var(--morph-accent)';
const BAD = 'var(--morph-bad)';
const GOOD = 'var(--morph-good)';
const MUTED = 'var(--morph-series-2)';

function onKeyActivate(fn: (el: HTMLElement | null) => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn(e.currentTarget as unknown as HTMLElement);
    }
  };
}

/** Horizontal bars per group with moving and stuck segments (MO-502). */
export function StackedBars(props: { bars: StackedBar[]; format(n: number): string; active?: string | null; onSelect?(key: string | null): void; title: string }) {
  const { bars } = props;
  const max = Math.max(1, ...bars.map((b) => b.a + b.b));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1]!;
  const x0 = 190;
  const x1 = 860;
  const rh = 46;
  const H = 12 + bars.length * rh + 28;
  const sx = (v: number) => x0 + (v / top) * (x1 - x0);
  return (
    <div className="morph-chart">
      <svg viewBox={`0 0 960 ${H}`} role="group" aria-label={props.title}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line className="grid" x1={sx(tk)} x2={sx(tk)} y1={8} y2={H - 26} />
            <text x={sx(tk)} y={H - 8} textAnchor="middle">
              {props.format(tk)}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const y = 12 + i * rh;
          const dim = props.active && props.active !== b.key;
          const select = () => props.onSelect?.(props.active === b.key ? null : b.key);
          return (
            <g
              key={b.key}
              className={`bar${dim ? ' dim' : ''}`}
              role="button"
              tabIndex={0}
              aria-pressed={props.active === b.key}
              aria-label={b.ariaLabel}
              onClick={select}
              onKeyDown={onKeyActivate(select)}
            >
              <rect x={0} y={y - 4} width={960} height={rh - 4} fill="transparent" />
              <text className="lbl" x={16} y={y + 12}>
                {b.label}
              </text>
              {b.sub && (
                <text x={16} y={y + 29} style={{ fontSize: 11.5 }}>
                  {b.sub}
                </text>
              )}
              <rect className="mk" x={x0} y={y + 4} width={Math.max(0, sx(b.a) - x0)} height={18} rx={4} fill={ACC} />
              <rect className="mk" x={sx(b.a)} y={y + 4} width={Math.max(0, sx(b.a + b.b) - sx(b.a))} height={18} rx={4} fill={BAD} />
              <text className="val" x={sx(b.a + b.b) + 8} y={y + 18}>
                {props.format(b.a + b.b)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Columns per period with an optional dashed target line (MO-507). */
export function ColumnChart(props: { points: { key: string; label: string; value: number; partial?: boolean }[]; target?: number; format(n: number): string; title: string; targetLabel: string; toDateLabel: string; onSelect?(key: string, el: HTMLElement | null): void }) {
  const { points } = props;
  const max = Math.max(1, props.target ?? 0, ...points.map((p) => p.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1]!;
  const H = 240;
  const y0 = 200;
  const left = 70;
  const w = 880;
  const bw = Math.min(70, (w / Math.max(1, points.length)) * 0.6);
  const sy = (v: number) => y0 - (v / top) * (y0 - 16);
  return (
    <div className="morph-chart">
      <svg viewBox={`0 0 960 ${H}`} role={props.onSelect ? 'group' : 'img'} aria-label={props.onSelect ? props.title : `${props.title}: ${points.map((p) => `${p.label} ${props.format(p.value)}`).join(', ')}`}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line className="grid" x1={left} x2={left + w} y1={sy(tk)} y2={sy(tk)} />
            <text x={left - 8} y={sy(tk) + 4} textAnchor="end">
              {props.format(tk)}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = left + (w / points.length) * (i + 0.5);
          const above = props.target !== undefined && p.value >= props.target;
          const select = (el: HTMLElement | null) => props.onSelect?.(p.key, el);
          const act = props.onSelect
            ? { className: 'bar', role: 'button', tabIndex: 0, 'aria-label': `${p.label}${p.partial ? ` ${props.toDateLabel}` : ''}, ${props.format(p.value)}`, onClick: (e: React.MouseEvent) => select(e.currentTarget as unknown as HTMLElement), onKeyDown: onKeyActivate(select) }
            : {};
          return (
            <g key={p.key} {...act}>
              <rect className="mk" x={cx - bw / 2} y={sy(p.value)} width={bw} height={y0 - sy(p.value)} rx={4} fill={above ? GOOD : ACC} opacity={p.partial ? 0.45 : 1} />
              <text className="val" x={cx} y={sy(p.value) - 6} textAnchor="middle">
                {props.format(p.value)}
              </text>
              <text x={cx} y={y0 + 18} textAnchor="middle">
                {p.label}
                {p.partial ? ` ${props.toDateLabel}` : ''}
              </text>
            </g>
          );
        })}
        {props.target !== undefined && (
          <g>
            <line x1={left} x2={left + w} y1={sy(props.target)} y2={sy(props.target)} stroke="var(--morph-ink-2)" strokeDasharray="5 4" />
            <text x={left + w} y={sy(props.target) - 6} textAnchor="end">
              {props.targetLabel} {props.format(props.target)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

/** Centered bars per stage, width by count (MO-508). */
export function Funnel(props: { steps: { key: string; label: string; count: number; value: string }[]; title: string; onSelect?(key: string, el: HTMLElement | null): void }) {
  const max = Math.max(1, ...props.steps.map((s) => s.count));
  return (
    <div className="morph-chart">
      <svg viewBox={`0 0 600 ${props.steps.length * 56 + 8}`} role="group" aria-label={props.title} style={{ minWidth: 280 }}>
        {props.steps.map((s, i) => {
          const w = 120 + (s.count / max) * 440;
          const select = (el: HTMLElement | null) => props.onSelect?.(s.key, el);
          return (
            <g key={s.key} className="bar" role="button" tabIndex={0} aria-label={`${s.label}, ${s.count}, ${s.value}`} onClick={(e) => select(e.currentTarget as unknown as HTMLElement)} onKeyDown={onKeyActivate(select)}>
              <rect x={300 - w / 2} y={8 + i * 56} width={w} height={46} rx={8} fill={ACC} opacity={0.45 + 0.55 * ((i + 1) / props.steps.length)} />
              <text x={300} y={8 + i * 56 + 20} textAnchor="middle" style={{ fill: 'var(--morph-accent-ink)', fontWeight: 600 }}>
                {s.label} · {s.count}
              </text>
              <text x={300} y={8 + i * 56 + 37} textAnchor="middle" style={{ fill: 'var(--morph-accent-ink)', fontSize: 11.5 }}>
                {s.value}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Bars per owner with stuck portion and a dashed cap line (MO-509). */
export function WorkloadBars(props: { owners: { key: string; label: string; open: number; stuck: number; stuckLabel: string }[]; cap: number; title: string; capLabel: string; onSelect?(key: string, el: HTMLElement | null): void }) {
  const max = Math.max(props.cap + 2, ...props.owners.map((o) => o.open));
  const ticks = niceTicks(max, 4);
  const top = ticks[ticks.length - 1]!;
  const x0 = 150;
  const x1 = 860;
  const rh = 40;
  const H = props.owners.length * rh + 40;
  const sx = (v: number) => x0 + (v / top) * (x1 - x0);
  return (
    <div className="morph-chart">
      <svg viewBox={`0 0 960 ${H}`} role="group" aria-label={props.title}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line className="grid" x1={sx(tk)} x2={sx(tk)} y1={4} y2={H - 26} />
            <text x={sx(tk)} y={H - 8} textAnchor="middle">
              {tk}
            </text>
          </g>
        ))}
        {props.owners.map((o, i) => {
          const y = 8 + i * rh;
          const over = o.open > props.cap;
          const select = (el: HTMLElement | null) => props.onSelect?.(o.key, el);
          return (
            <g key={o.key} className="bar" role="button" tabIndex={0} aria-label={`${o.label}, ${o.open} open, ${o.stuck} stuck${over ? ', over cap' : ''}`} onClick={(e) => select(e.currentTarget as unknown as HTMLElement)} onKeyDown={onKeyActivate(select)}>
              <text className="lbl" x={16} y={y + 17} style={over ? { fill: BAD } : undefined}>
                {o.label}
              </text>
              <rect className="mk" x={x0} y={y + 4} width={sx(o.open) - x0} height={18} rx={4} fill={over ? 'var(--morph-bad-soft)' : MUTED} />
              <rect className="mk" x={x0} y={y + 4} width={sx(o.stuck) - x0} height={18} rx={4} fill={over ? BAD : ACC} />
              <text className="val" x={sx(o.open) + 8} y={y + 18} style={over ? { fill: BAD } : undefined}>
                {o.open}
                {o.stuck ? ` ${o.stuckLabel}` : ''}
              </text>
            </g>
          );
        })}
        <line x1={sx(props.cap)} x2={sx(props.cap)} y1={2} y2={H - 26} stroke="var(--morph-ink-2)" strokeDasharray="5 4" />
        <text x={sx(props.cap) + 4} y={12} style={{ fontSize: 11.5 }}>
          {props.capLabel}
        </text>
      </svg>
    </div>
  );
}

/** Stage × age bucket grid; every cell is a button (MO-510). */
export function Heatmap(props: { rows: { key: string; label: string }[]; buckets: string[]; counts: number[][]; lateFrom: number; onSelect?(row: string, bucket: number, el: HTMLElement | null): void; active?: { row: string; bucket: number } | null; title: string }) {
  const max = Math.max(1, ...props.counts.flat());
  return (
    <div className="morph-heat" role="group" aria-label={props.title} style={{ gridTemplateColumns: `minmax(80px,auto) repeat(${props.buckets.length}, minmax(44px,1fr))` }}>
      <span />
      {props.buckets.map((b) => (
        <span key={b} className="morph-muted" style={{ textAlign: 'center' }}>
          {b}
        </span>
      ))}
      {props.rows.map((r, ri) => (
        <div key={r.key} style={{ display: 'contents' }}>
          <span style={{ alignSelf: 'center' }}>{r.label}</span>
          {props.buckets.map((b, bi) => {
            const n = props.counts[ri]?.[bi] ?? 0;
            const late = bi >= props.lateFrom;
            const alpha = n ? 0.15 + 0.55 * (n / max) : 0;
            const bg = n ? `color-mix(in srgb, var(${late ? '--morph-bad' : '--morph-accent'}) ${Math.round(alpha * 100)}%, var(--morph-surface))` : 'var(--morph-sunken)';
            const on = props.active?.row === r.key && props.active.bucket === bi;
            return (
              <button key={b} type="button" aria-pressed={on} aria-label={`${r.label}, ${b}: ${n}`} style={{ background: bg, outline: on ? '2px solid var(--morph-ink)' : undefined, color: !n ? 'var(--morph-muted)' : !late && alpha > 0.5 ? 'var(--morph-accent-ink)' : 'var(--morph-ink)' }} onClick={(e) => props.onSelect?.(r.key, bi, e.currentTarget)}>
                {n}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Tiny sparkline with area fill and an emphasised last point. */
export function Sparkline(props: { values: number[]; label: string }) {
  const v = props.values.length ? props.values : [0];
  const max = Math.max(...v);
  const min = Math.min(...v);
  const W = 200;
  const H = 40;
  const pts = v.map((y, i) => [v.length === 1 ? W : (i / (v.length - 1)) * W, H - 4 - ((y - min) / Math.max(1, max - min)) * (H - 8)] as const);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1]!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={props.label} preserveAspectRatio="none">
      <path d={`${d} L${W},${H} L0,${H} Z`} fill="var(--morph-accent-soft)" />
      <path d={d} fill="none" stroke={ACC} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={3.5} fill={ACC} />
    </svg>
  );
}

/** Aging histogram for the queue's report view. */
export function Histogram(props: { buckets: { label: string; count: number; late: boolean }[]; active?: number | null; onSelect?(i: number | null): void; title: string }) {
  const max = Math.max(1, ...props.buckets.map((b) => b.count));
  return (
    <div className="morph-chart">
      <svg viewBox="0 0 600 170" role="group" aria-label={props.title} style={{ minWidth: 280 }}>
        {props.buckets.map((b, i) => {
          const w = 600 / props.buckets.length;
          const h = (b.count / max) * 110;
          const select = () => props.onSelect?.(props.active === i ? null : i);
          return (
            <g key={b.label} className={`bar${props.active != null && props.active !== i ? ' dim' : ''}`} role="button" tabIndex={0} aria-pressed={props.active === i} aria-label={`${b.label}: ${b.count}`} onClick={select} onKeyDown={onKeyActivate(select)}>
              <rect className="mk" x={i * w + 14} y={130 - h} width={w - 28} height={h} rx={4} fill={b.late ? BAD : ACC} />
              <text className="val" x={i * w + w / 2} y={124 - h} textAnchor="middle">
                {b.count}
              </text>
              <text x={i * w + w / 2} y={150} textAnchor="middle">
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export const compact = formatCompact;
