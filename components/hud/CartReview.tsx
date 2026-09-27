"use client";

import { useEffect, useMemo, useState } from "react";
import { usePeople } from "@/lib/people/roster";
import { participantIds } from "@/lib/stage/slices/council";
import { useStage } from "@/lib/stage/store";
import type { Bundle, CatalogItem } from "@/types/domain";
import { SupporterRing } from "./SupporterRing";
import { supportersFor, supportSentence } from "./supporters";
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

/** Big round Plaza-style action: an icon in a circle with the label beneath. */
function RoundAction({
  icon,
  label,
  tone,
  target,
  ...rest
}: {
  icon: string;
  label: string;
  tone: "approve" | "swap" | "cancel";
  target: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  const toneClass = tone === "approve" ? styles.roundApprove : tone === "swap" ? styles.roundSwap : styles.roundCancel;
  return (
    <button type="button" className={`${styles.round} ${toneClass}`} data-hand-target={target} {...rest}>
      <span className={styles.roundIcon} aria-hidden>
        {icon}
      </span>
      <span className={styles.roundLabel}>{label}</span>
    </button>
  );
}

/** The product, big, with a friendly named card when there is no photo. */
function Hero({ item }: { item: CatalogItem }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [item.id]);
  if (item.imageUrl && !broken) {
    return <img src={item.imageUrl} alt={item.name} className={styles.heroImage} onError={() => setBroken(true)} />;
  }
  return (
    <div className={styles.heroCard} role="img" aria-label={item.name}>
      <span className={styles.heroCardBow} aria-hidden>
        🎁
      </span>
      <span className={styles.heroCardName}>{item.name}</span>
    </div>
  );
}

/** Human review gate between the council's proposal and creation of a real merchant cart. */
export function CartReview({ bundle, swapping, onSwap, onCancel, onApproveCart, plaza = false }: CartReviewProps) {
  const [index, setIndex] = useState(0);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(() => new Set());
  const [prompt, setPrompt] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const ids = useMemo(() => new Set(bundle.items.map((item) => item.id)), [bundle.items]);

  const people = usePeople();
  const sprites = useStage((state) => state.sprites);
  const opinions = useStage((state) => state.opinions);
  const mission = useStage((state) => state.mission);
  const scores = useStage((state) => state.scores);

  useEffect(() => {
    setApprovedIds((previous) => new Set([...previous].filter((id) => ids.has(id))));
    setIndex((current) => Math.min(current, Math.max(0, bundle.items.length - 1)));
    setPrompt("");
    setAskOpen(false);
    setConfirmCancel(false);
  }, [bundle, ids]);

  const item = bundle.items[index];
  const complete = bundle.items.length > 0 && bundle.items.every((entry) => approvedIds.has(entry.id));
  const participants = useMemo(() => participantIds({ sprites, opinions, mission }), [sprites, opinions, mission]);
  const nameOf = (id: string) => people.find((person) => person.id === id)?.name ?? id;
  const supporters = useMemo(
    () => (item ? supportersFor(item.id, participants, bundle.serves ?? {}, scores) : []),
    [item, participants, bundle.serves, scores],
  );

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

  const shell = `${styles.review} ${plaza ? styles.plaza : ""}`;

  if (!item) {
    return (
      <aside className={shell} aria-label="Cart decision">
        <p className={styles.eyebrow}>Cart decision</p>
        <h2>Nothing to review</h2>
        <button type="button" className={styles.cancel} onClick={() => onCancel("empty-cart")}>
          Cancel proposal
        </button>
      </aside>
    );
  }

  const isApproved = approvedIds.has(item.id);
  const searching = swapping === item.id;
  const reasons = (item.selectedBecause ?? []).slice(0, 2);
  const quantity = item.quantity && item.quantity > 1 ? ` × ${item.quantity}` : "";

  return (
    <aside className={shell} aria-label="Review proposed cart">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Your decision</p>
          <h2>{complete ? "Cart ready" : bundle.items.length === 1 ? "The council's pick" : `Pick ${index + 1} of ${bundle.items.length}`}</h2>
        </div>
        <span className={styles.progress}>
          {approvedIds.size}/{bundle.items.length} approved
        </span>
      </div>

      {bundle.items.length > 1 && (
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
      )}

      <div className={styles.hero}>
        <Hero item={item} />
        <span className={isApproved ? styles.approved : styles.pending}>{isApproved ? "Approved" : searching ? "Finding another…" : "Your approval needed"}</span>
      </div>

      <div className={styles.details}>
        <h3>{item.name}</h3>
        <p className={styles.price}>
          {money(item.price, item.currency ?? "USD")}
          {quantity}
          {item.merchantName && <small> · {item.merchantName}</small>}
        </p>
        {reasons.length > 0 && (
          <ul className={styles.reasons} aria-label="Why the council chose this">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </div>

      {supporters.length > 0 && (
        <section className={styles.supporters} aria-label="Who supports this pick">
          <ul className={styles.supporterRow}>
            {supporters.map((supporter) => (
              <SupporterRing key={supporter.id} supporter={supporter} name={nameOf(supporter.id)} />
            ))}
          </ul>
          <p className={styles.supportLine}>{supportSentence(supporters, nameOf)}</p>
        </section>
      )}

      {!complete && (
        <div className={styles.decisionActions}>
          <div className={styles.roundRow}>
            <RoundAction icon="✓" label={isApproved ? "Approved" : "Approve"} tone="approve" target="review-approve" disabled={isApproved || searching} onClick={() => approveItem(item)} />
            <RoundAction icon="↻" label={searching ? "Searching…" : "Find another"} tone="swap" target="review-swap" disabled={searching} onClick={() => requestSwap(item)} />
            <RoundAction icon="✕" label={confirmCancel ? "Sure?" : "Decline cart"} tone="cancel" target="review-cancel" aria-pressed={confirmCancel} onClick={() => setConfirmCancel((was) => !was)} />
          </div>
          {confirmCancel && (
            <span className={styles.cancelConfirm} role="group" aria-label="Confirm cancelling the cart">
              <button type="button" className={styles.cancel} onClick={() => onCancel(item.id)}>
                Yes, cancel the cart
              </button>
              <button type="button" onClick={() => setConfirmCancel(false)}>
                Keep it
              </button>
            </span>
          )}
          <button type="button" className={styles.askToggle} aria-expanded={askOpen} onClick={() => setAskOpen((was) => !was)}>
            {askOpen ? "Hide" : "Ask for something specific"}
          </button>
          {askOpen && (
            <div className={styles.ask}>
              <label className={styles.promptLabel}>
                Tell the agent what to change
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Example: same item, but blue and under $20"
                  rows={2}
                />
              </label>
              <button type="button" className={styles.promptSwap} disabled={!prompt.trim() || searching} onClick={() => requestSwap(item, prompt.trim())}>
                Search using my request
              </button>
            </div>
          )}
        </div>
      )}

      {complete && (
        <div className={styles.finalDecision}>
          <p>Every item is approved. Shopify checkout will open after price and availability checks pass.</p>
          <button type="button" className={styles.checkout} data-hand-target="review-checkout" onClick={onApproveCart}>
            Approve cart &amp; continue to checkout
          </button>
          <button
            type="button"
            className={styles.swap}
            onClick={() =>
              setApprovedIds((previous) => {
                const next = new Set(previous);
                next.delete(item.id);
                return next;
              })
            }
          >
            Change this item
          </button>
        </div>
      )}

      {bundle.items.length > 1 && (
        <div className={styles.navigation}>
          <button type="button" disabled={index === 0} onClick={() => setIndex((current) => current - 1)}>
            ‹ Previous
          </button>
          <button type="button" disabled={index === bundle.items.length - 1} onClick={() => setIndex((current) => current + 1)}>
            Next ›
          </button>
        </div>
      )}
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
