"use client";

import React, { useEffect, useMemo, useState } from "react";
import { MandateButton } from "@/components/controls/MandateButton";
import { handItem, handTarget } from "@/components/hands/makerHitTest";
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
  /** Cream plaza dialog; leave unset for the dark living-room HUD. */
  plaza?: boolean;
}

/** Human review gate between the council's proposal and creation of a real merchant cart. */
export function CartReview({ bundle, swapping, onSwap, onCancel, onApproveCart, plaza = false }: CartReviewProps) {
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
      <aside className={`${styles.review} ${plaza ? styles.plaza : ""}`} aria-label="Cart decision">
        <p className={styles.eyebrow}>Cart decision</p>
        <h2>Nothing to review</h2>
        <button
          type="button"
          className={styles.cancel}
          {...handTarget("cart-empty")}
          onClick={() => onCancel("empty-cart")}
        >
          Cancel proposal
        </button>
      </aside>
    );
  }

  return (
    <aside className={`${styles.review} ${plaza ? styles.plaza : ""}`} aria-label="Review proposed cart">
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
            {...handTarget(`cart-step:${entry.id}`)}
            onClick={() => setIndex(itemIndex)}
          />
        ))}
      </div>

      <div className={styles.product} {...handItem(item.id)}>
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
          <button
            type="button"
            className={styles.approve}
            disabled={approvedIds.has(item.id) || swapping === item.id}
            {...handTarget(`cart-item-approve:${item.id}`)}
            onClick={() => approveItem(item)}
          >
            {approvedIds.has(item.id) ? "✓ Item approved" : "✓ Approve item"}
          </button>
          <button
            type="button"
            className={styles.swap}
            disabled={swapping === item.id}
            {...handTarget(`cart-item-swap:${item.id}`)}
            onClick={() => requestSwap(item)}
          >
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
            {...handTarget(`cart-item-swap-prompt:${item.id}`)}
            onClick={() => requestSwap(item, prompt.trim())}
          >
            Search using my request
          </button>
        </div>
      )}

      {complete && (
        <div className={styles.finalDecision}>
          <p>Every item is approved. Hold to sign, and Shopify checkout will open from the receipt.</p>
          <MandateButton plaza={plaza} onApprove={onApproveCart} label="Hold to approve" />
          <button
            type="button"
            className={styles.swap}
            {...handTarget(`cart-item-change:${item.id}`)}
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
        <button
          type="button"
          disabled={index === 0}
          {...handTarget("cart-nav-prev")}
          onClick={() => setIndex((current) => current - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          disabled={index === bundle.items.length - 1}
          {...handTarget("cart-nav-next")}
          onClick={() => setIndex((current) => current + 1)}
        >
          Next
        </button>
        {!confirmCancel ? (
          <button
            type="button"
            className={styles.cancel}
            {...handTarget("cart-cancel-start")}
            onClick={() => setConfirmCancel(true)}
          >
            Cancel entire cart
          </button>
        ) : (
          <span className={styles.cancelConfirm}>
            <button
              type="button"
              className={styles.cancel}
              {...handTarget(`cart-cancel:${item.id}`)}
              onClick={() => onCancel(item.id)}
            >
              Yes, cancel
            </button>
            <button type="button" {...handTarget("cart-cancel-abort")} onClick={() => setConfirmCancel(false)}>
              Keep cart
            </button>
          </span>
        )}
      </div>
    </aside>
  );
}

export function CartRejected({ plaza = false }: { plaza?: boolean }) {
  return (
    <aside className={`${styles.review} ${plaza ? styles.plaza : ""}`} aria-label="Cart cancelled" role="status">
      <p className={styles.eyebrow}>Your decision</p>
      <h2>Cart cancelled</h2>
      <p className={styles.rejectedCopy}>Nothing was purchased and no checkout was created.</p>
    </aside>
  );
}
