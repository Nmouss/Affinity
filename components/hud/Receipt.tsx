"use client";

import { handTarget } from "@/components/hands/makerHitTest";
import type { CommerceCart, NotificationDelivery, ReceiptResult, SignedMandate } from "@/types/domain";
import { SparkleIcon } from "./icons";
import styles from "./Receipt.module.css";

/**
 * Pure: which checkout link to surface. A handshake has no user activation, so checkout can no longer
 * open itself automatically at signing time (see Hud's former checkoutTab); instead the receipt shows
 * a real button once the backend hands back a merchant checkout URL, and a real click on it carries
 * its own activation.
 */
export function selectCheckoutUrl(carts: readonly CommerceCart[]): string | null {
  return carts[0]?.checkoutUrl ?? null;
}

/**
 * Opens checkout in a new tab, or in this one when the browser refuses the popup. A Leap pinch
 * reaches this through MakerHands' element.click(), which carries no user activation, so the popup
 * blocker drops window.open; navigating the current tab needs no activation.
 */
export function openCheckout(url: string, win: Pick<Window, "open" | "location"> = window): void {
  const tab = win.open(url, "_blank");
  if (tab) tab.opener = null;
  else win.location.assign(url);
}

/** Shown only after LangGraph finalizes approval and any post-approval side effects. */
export function Receipt({
  receipt,
  mandate,
  carts,
  notifications,
  plaza = false,
}: {
  receipt: ReceiptResult;
  mandate: SignedMandate;
  carts: CommerceCart[];
  notifications: NotificationDelivery[];
  plaza?: boolean;
}) {
  const approved = new Date(mandate.approvedAt);
  const isCart = "bundle" in mandate;
  const checkoutUrl = selectCheckoutUrl(carts);
  return (
    <aside className={`${styles.receipt} ${plaza ? styles.plaza : ""}`} aria-label="Approved proposal" aria-live="polite">
      <p className={styles.seal} aria-hidden>
        <SparkleIcon size={28} />
      </p>
      <h2 className={styles.heading}>{plaza ? "You're all set" : "Mandate signed"}</h2>
      <dl className={styles.facts}>
        <dt>Intent</dt>
        <dd>
          {mandate.mission.freeText} · budget ${mandate.mission.budget}
        </dd>
        <dt>{isCart ? "Cart" : "Plan"}</dt>
        <dd>
          {isCart
            ? `${mandate.bundle.items.length} items · $${mandate.bundle.total}`
            : `${mandate.plan.stops.length} stops · ${mandate.plan.location}`}
        </dd>
        <dt>Approved</dt>
        <dd>{Number.isNaN(approved.getTime()) ? mandate.approvedAt : approved.toLocaleString()}</dd>
        {!plaza && (
          <>
            <dt>Signature</dt>
            <dd className={styles.mono}>{mandate.signature.slice(0, 24)}…</dd>
            <dt>Receipt</dt>
            <dd className={styles.mono}>{receipt.threadId}</dd>
          </>
        )}
      </dl>
      {checkoutUrl && (
        <div className={styles.checkoutLinks}>
          <button
            type="button"
            className={styles.checkoutButton}
            {...handTarget("receipt-checkout")}
            onClick={() => openCheckout(checkoutUrl)}
          >
            Open Shopify checkout
          </button>
        </div>
      )}
      {notifications.length > 0 && (
        <p className={styles.note}>
          Plan notifications: {notifications.filter((item) => item.status !== "failed").length}/{notifications.length} delivered.
        </p>
      )}
      <p className={styles.note}>
        {plaza
          ? isCart
            ? "Checkout opens separately. Nothing was charged from here."
            : "The plan is saved. Open Map or Website on a stop to continue."
          : `Human-present flow: your handshake signed this proposal with this device's ECDSA P-256 key.${
              isCart ? " Checkout remains a separate handoff; no payment was submitted." : " The approved plan is now finalized."
            }`}
      </p>
      {!plaza && (
        <p className={styles.reset}>
          Press <span className={styles.kbd}>R</span> to start over
        </p>
      )}
    </aside>
  );
}
