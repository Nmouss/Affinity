import type { CartMandate, CommerceCart, CouncilReceipt, Mission } from "@/types/domain";
import type { RunStatus } from "@/lib/stage/slices/council";
import { formatMoney } from "@/components/bundle/ProductPanel";
import live from "./LiveCouncil.module.css";
import styles from "./Receipt.module.css";

export interface ReceiptProps {
  receipt: CouncilReceipt;
  /** Merchant carts from the post-approval `carts` event; the only checkout links Affinity shows. */
  carts: CommerceCart[];
  /** The browser's signed proof, when the device key was available. */
  mandate: CartMandate | null;
  mission: Mission | null;
  runStatus: RunStatus;
}

/**
 * The end of a council: the backend's receipt plus the merchant cart handoff. Vocabulary follows AP2
 * (intent → cart mandate → receipt); the checkout links come only from carts the backend created after
 * approval and preflight, never from a product's discovery-time URL. Affinity never submits payment.
 */
export function Receipt({ receipt, carts, mandate, mission, runStatus }: ReceiptProps) {
  const approved = receipt.status === "approved";
  const awaitingCarts = approved && carts.length === 0 && runStatus === "running";
  const noCarts = approved && carts.length === 0 && runStatus !== "running";
  return (
    <aside className={styles.receipt} aria-label={approved ? "Approved cart and checkout handoff" : "Declined proposal"} aria-live="polite">
      <p className={styles.seal} aria-hidden>
        {approved ? "✦" : "○"}
      </p>
      <h2 className={styles.heading}>{approved ? "Approved by the council" : "Proposal declined"}</h2>
      <dl className={styles.facts}>
        {mission && (
          <>
            <dt>Intent</dt>
            <dd>
              {mission.freeText} · budget {formatMoney(mission.budget)}
            </dd>
          </>
        )}
        {receipt.total !== undefined && (
          <>
            <dt>Total</dt>
            <dd>{formatMoney(receipt.total, carts[0]?.currency)}</dd>
          </>
        )}
        {mandate && (
          <>
            <dt>Your handshake</dt>
            <dd className={styles.mono}>{mandate.signature.slice(0, 24)}…</dd>
          </>
        )}
        <dt>Council thread</dt>
        <dd className={styles.mono}>{receipt.threadId}</dd>
      </dl>

      {approved && carts.length > 0 && (
        <ul className={live.carts} aria-label="Checkout handoff">
          {carts.map((cart) => (
            <li key={cart.cartId || cart.checkoutUrl}>
              <a className={live.cartLink} href={cart.checkoutUrl} target="_blank" rel="noopener noreferrer">
                <span>Open checkout at {cart.merchantDomain}</span>
                {cart.total !== undefined && <span className={live.cartTotal}>{formatMoney(cart.total, cart.currency)}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
      {awaitingCarts && <p className={live.pending}>Creating your merchant cart…</p>}
      {noCarts && <p className={live.warning}>No merchant cart came back. Nothing was purchased; try approving again or reset.</p>}

      <p className={styles.note}>
        {approved
          ? "The merchant checkout opens in a new tab. Affinity created the cart; it never pays for anything."
          : "The council stopped here. No cart was created and nothing was purchased."}
      </p>
      <p className={styles.reset}>
        Press <span className={styles.kbd}>R</span> to start over
      </p>
    </aside>
  );
}
