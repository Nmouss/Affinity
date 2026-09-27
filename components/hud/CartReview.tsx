"use client";

import { useEffect, useMemo, useState } from "react";
import type { Bundle, CatalogItem } from "@/types/domain";
import styles from "./CartReview.module.css";

const money = (value: number, currency = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);

export interface CartReviewProps {
  bundle: Bundle;
  swapping: string | null;
  onSwap: (itemId: string, prompt?: string) => void;
  onCancel: (itemId: string) => void;
  onApproveCart: () => void;
}

/** Human review gate between the council's proposal and creation of a real merchant cart. */
export function CartReview({ bundle, swapping, onSwap, onCancel, onApproveCart }: CartReviewProps) {
  const [index, setIndex] = useState(0);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(() => new Set());
  const [prompt, setPrompt] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const ids = useMemo(() => new Set(bundle.items.map((item) => item.id)), [bundle.items]);

  useEffect(() => {
    setApprovedIds((previous) => new Set([...previous].filter((id) => ids.has(id))));
    setIndex((current) => Math.min(current, Math.max(0, bundle.items.length - 1)));
    setPrompt("");
    setConfirmCancel(false);
  }, [bundle, ids]);

  const item = bundle.items[index];
  const complete = bundle.items.length > 0 && bundle.items.every((entry) => approvedIds.has(entry.id));

  function approveItem(entry: CatalogItem) {
    const nextApproved = new Set(approvedIds).add(entry.id);
    setApprovedIds(nextApproved);
    setPrompt("");
    const nextPending = bundle.items.findIndex((candidate) => !nextApproved.has(candidate.id));
    if (nextPending >= 0) setIndex(nextPending);
  }

  function requestSwap(entry: CatalogItem, request?: string) {
    setApprovedIds((previous) => {
      const next = new Set(previous);
      next.delete(entry.id);
      return next;
    });
    onSwap(entry.id, request);
  }

  if (!item) {
    return (
      <aside className={styles.review} aria-label="Cart decision">
        <p className={styles.eyebrow}>Cart decision</p>
        <h2>Nothing to review</h2>
        <button type="button" className={styles.cancel} onClick={() => onCancel("empty-cart")}>
          Cancel proposal
        </button>
      </aside>
    );
  }

  return (
    <aside className={styles.review} aria-label="Review proposed cart">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Your decision</p>
          <h2>{complete ? "Cart ready" : `Review item ${index + 1} of ${bundle.items.length}`}</h2>
        </div>
        <span className={styles.progress}>{approvedIds.size}/{bundle.items.length} approved</span>
      </div>

      <div className={styles.steps} aria-label="Cart review progress">
        {bundle.items.map((entry, itemIndex) => (
          <button
            key={entry.id}
            type="button"
            className={approvedIds.has(entry.id) ? styles.stepApproved : itemIndex === index ? styles.stepCurrent : styles.step}
            aria-label={`${entry.name}: ${approvedIds.has(entry.id) ? "approved" : "not reviewed"}`}
            onClick={() => setIndex(itemIndex)}
          />
        ))}
      </div>

      <div className={styles.product}>
        {item.imageUrl ? <img src={item.imageUrl} alt="" className={styles.image} /> : <div className={styles.placeholder}>No image</div>}
        <div className={styles.details}>
          <span className={approvedIds.has(item.id) ? styles.approved : styles.pending}>
            {approvedIds.has(item.id) ? "Approved" : "Your approval needed"}
          </span>
          <h3>{item.name}</h3>
          <p>{money(item.price, item.currency ?? "USD")}{item.quantity && item.quantity > 1 ? ` × ${item.quantity}` : ""}</p>
          {item.merchantName && <small>{item.merchantName}</small>}
        </div>
      </div>

      {!complete && (
        <div className={styles.decisionActions}>
          <button type="button" className={styles.approve} disabled={approvedIds.has(item.id) || swapping === item.id} onClick={() => approveItem(item)}>
            {approvedIds.has(item.id) ? "✓ Item approved" : "✓ Approve item"}
          </button>
          <button type="button" className={styles.swap} disabled={swapping === item.id} onClick={() => requestSwap(item)}>
            {swapping === item.id ? "Agent is searching…" : "↻ Agent find another"}
          </button>
          <label className={styles.promptLabel}>
            Or tell the agent what to change
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Example: same item, but blue and under $20"
              rows={2}
            />
          </label>
          <button
            type="button"
            className={styles.promptSwap}
            disabled={!prompt.trim() || swapping === item.id}
            onClick={() => requestSwap(item, prompt.trim())}
          >
            Search using my request
          </button>
        </div>
      )}

      {complete && (
        <div className={styles.finalDecision}>
          <p>Every item is approved. Shopify checkout will open after price and availability checks pass.</p>
          <button type="button" className={styles.checkout} onClick={onApproveCart}>
            Approve cart &amp; continue to checkout
          </button>
          <button
            type="button"
            className={styles.swap}
            onClick={() => setApprovedIds((previous) => {
              const next = new Set(previous);
              next.delete(item.id);
              return next;
            })}
          >
            Change this item
          </button>
        </div>
      )}

      <div className={styles.navigation}>
        <button type="button" disabled={index === 0} onClick={() => setIndex((current) => current - 1)}>Previous</button>
        <button type="button" disabled={index === bundle.items.length - 1} onClick={() => setIndex((current) => current + 1)}>Next</button>
        {!confirmCancel ? (
          <button type="button" className={styles.cancel} onClick={() => setConfirmCancel(true)}>Cancel entire cart</button>
        ) : (
          <span className={styles.cancelConfirm}>
            <button type="button" className={styles.cancel} onClick={() => onCancel(item.id)}>Yes, cancel</button>
            <button type="button" onClick={() => setConfirmCancel(false)}>Keep cart</button>
          </span>
        )}
      </div>
    </aside>
  );
}

export function CartRejected() {
  return (
    <aside className={styles.review} aria-label="Cart rejected" role="status">
      <p className={styles.eyebrow}>Your decision</p>
      <h2>Cart cancelled</h2>
      <p className={styles.rejectedCopy}>Nothing was purchased and no Shopify cart was created.</p>
    </aside>
  );
}
