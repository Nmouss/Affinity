import type { CommerceCart, NotificationDelivery, ReceiptResult, SignedMandate } from "@/types/domain";
import styles from "./Receipt.module.css";

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
  return (
    <aside className={`${styles.receipt} ${plaza ? styles.plaza : ""}`} aria-label="Approved proposal" aria-live="polite">
      <p className={styles.seal} aria-hidden>
        ✦
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
      {carts.length > 0 && (
        <div className={styles.checkoutLinks}>
          {carts.map((cart) => (
            <a key={`${cart.merchantDomain}:${cart.cartId}`} href={cart.checkoutUrl} target="_blank" rel="noreferrer">
              Checkout at {cart.merchantDomain}
            </a>
          ))}
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
