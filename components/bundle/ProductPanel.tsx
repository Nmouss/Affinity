"use client";

import { emitGesture } from "@/lib/stage/bus";
import type { Bundle, CatalogItem } from "@/types/domain";
import styles from "./ProductPanel.module.css";

export function formatMoney(value: number, currency?: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    return `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
  }
}

/** Short consumer label for where the proposal came from; never calls a fallback "live". */
export function sourceLabel(source: Bundle["source"]): string | null {
  switch (source) {
    case "shopify_ucp":
      return "Shopify";
    case "local":
      return "Demo catalog";
    default:
      return null;
  }
}

export interface ProductPanelProps {
  item: CatalogItem;
  bundle: Bundle;
  budget: number;
  /** Defaults to pinch-tapping the item's pedestal (focus + inspect camera). */
  onInspect?: (item: CatalogItem) => void;
  /** Defaults to the swipe gesture, which the director turns into a replacement request. */
  onReplace?: (item: CatalogItem) => void;
}

/**
 * One product's facts and controls beside the pedestal: price, merchant, why the council picked
 * it, budget, warnings, and the alternatives it beat, with large Inspect and Replace controls.
 */
export function ProductPanel({ item, bundle, budget, onInspect, onReplace }: ProductPanelProps) {
  const ratio = budget > 0 ? bundle.total / budget : 1;
  const over = bundle.total > budget;
  const currency = item.currency;
  const alternatives = (bundle.rejectedAlternatives ?? []).filter((alternative) => alternative.slot === item.slot);
  const source = sourceLabel(bundle.source);
  const quantity = item.quantity ?? 1;

  const inspect = () => (onInspect ? onInspect(item) : emitGesture({ type: "pinchTap", target: `item:${item.id}` }));
  const replace = () => (onReplace ? onReplace(item) : emitGesture({ type: "swipe", itemId: item.id }));

  return (
    <section className={styles.panel} aria-label={`${item.name} details`}>
      <header className={styles.head}>
        <div>
          <h3 className={styles.name}>{item.name}</h3>
          <p className={styles.merchant}>
            {item.merchantName ?? "Local pick"}
            {source && (
              <>
                {" · "}
                <span className={styles.source}>{source}</span>
              </>
            )}
          </p>
        </div>
        <div>
          <div className={styles.price}>{formatMoney(item.price, currency)}</div>
          {quantity > 1 && <div className={styles.quantity}>× {quantity}</div>}
        </div>
      </header>

      <div className={styles.budget}>
        <div className={styles.budgetHead}>
          <strong>{formatMoney(bundle.total, currency)}</strong>
          <span>of {formatMoney(budget, currency)}</span>
          <span className={over ? styles.over : styles.left}>
            {over ? `${formatMoney(bundle.total - budget, currency)} over` : `${formatMoney(budget - bundle.total, currency)} left`}
          </span>
        </div>
        <div className={styles.track} role="meter" aria-label="Budget used" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={bundle.total}>
          <div className={over ? styles.fillOver : styles.fill} style={{ width: `${Math.min(1, ratio) * 100}%` }} />
        </div>
      </div>

      {item.selectedBecause && item.selectedBecause.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.title}>Why this</h4>
          <ul className={styles.list}>
            {item.selectedBecause.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {bundle.warnings?.map((warning) => (
        <p key={warning} className={styles.warning} role="note">
          {warning}
        </p>
      ))}

      {alternatives.length > 0 && (
        <details className={styles.details}>
          <summary>Other options the council passed on</summary>
          <ul className={styles.list}>
            {alternatives.map((alternative) => (
              <li key={alternative.id} className={styles.alternative}>
                <span>{alternative.name}</span>
                <small>{alternative.reason}</small>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={inspect} data-hand-target={`ui:inspect:${item.id}`}>
          Inspect
        </button>
        <button
          type="button"
          className={`${styles.action} ${styles.actionPrimary}`}
          onClick={replace}
          data-hand-target={`ui:replace:${item.id}`}
        >
          Replace
        </button>
      </div>
    </section>
  );
}
