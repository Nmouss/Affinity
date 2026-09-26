import type { CartMandate } from "@/types/domain";
import styles from "./Receipt.module.css";

/** Shown once /api/mandate verified the handshake's signature. Vocabulary follows AP2. */
export function Receipt({ receiptId, mandate }: { receiptId: string; mandate: CartMandate }) {
  const approved = new Date(mandate.approvedAt);
  return (
    <aside className={styles.receipt} aria-label="Signed mandate receipt" aria-live="polite">
      <p className={styles.seal} aria-hidden>
        ✦
      </p>
      <h2 className={styles.heading}>Mandate signed</h2>
      <dl className={styles.facts}>
        <dt>Intent</dt>
        <dd>
          {mandate.mission.freeText} · budget ${mandate.mission.budget}
        </dd>
        <dt>Cart mandate</dt>
        <dd>
          {mandate.bundle.items.length} items · ${mandate.bundle.total}
        </dd>
        <dt>Approved</dt>
        <dd>{Number.isNaN(approved.getTime()) ? mandate.approvedAt : approved.toLocaleString()}</dd>
        <dt>Signature</dt>
        <dd className={styles.mono}>{mandate.signature.slice(0, 24)}…</dd>
        <dt>Receipt</dt>
        <dd className={styles.mono}>{receiptId}</dd>
      </dl>
      <p className={styles.note}>
        Human-present flow: the mission is the intent, the approved bundle is the cart mandate, and your handshake signed
        it with this device&apos;s ECDSA P-256 key. No money moved.
      </p>
      <p className={styles.reset}>
        Press <span className={styles.kbd}>R</span> to start over
      </p>
    </aside>
  );
}
