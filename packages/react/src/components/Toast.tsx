import { useEffect } from 'react';
import type { T } from '../i18n.js';

export interface ToastItem {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'bad';
  sticky?: boolean;
}

function Toast(props: { item: ToastItem; onDismiss(id: string): void; t: T }) {
  const { item } = props;
  useEffect(() => {
    if (item.sticky) return;
    const h = setTimeout(() => props.onDismiss(item.id), item.actionLabel ? 6000 : 4000);
    return () => clearTimeout(h);
  }, [item, props]);
  return (
    <div className="morph-toast" role="status">
      <span>{item.message}</span>
      <span style={{ display: 'flex', gap: 6 }}>
        {item.actionLabel && (
          <button
            type="button"
            className="morph-btn sm"
            onClick={() => {
              props.onDismiss(item.id);
              item.onAction?.();
            }}
          >
            {item.actionLabel}
          </button>
        )}
        <button type="button" className="morph-btn sm ghost" aria-label={props.t('toast.dismiss')} onClick={() => props.onDismiss(item.id)}>
          ×
        </button>
      </span>
    </div>
  );
}

export function Toasts(props: { items: ToastItem[]; onDismiss(id: string): void; t: T }) {
  return (
    <div className="morph-toasts" aria-live="polite">
      {props.items.map((i) => (
        <Toast key={i.id} item={i} onDismiss={props.onDismiss} t={props.t} />
      ))}
    </div>
  );
}
