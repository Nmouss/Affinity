import { type ReactNode, useState } from "react";
import { Avatar, ProductImage, ScreenHeading } from "../components/common";
import type { Product, Recommendation, ShopperProfile } from "../services/contracts";
import { type Controller, hasPhysicalControl } from "../state/controller";
import { categoryLabel, money, nameFor, ruleLabel } from "../state/labels";
import type { AppState } from "../state/machine";
import { PushToTalk } from "../voice/PushToTalk";

interface ScreenProps {
  state: AppState;
  actions: Controller;
  /** The 3D table, or its 2D fallback. Injected so this screen works without WebGL. */
  scene: ReactNode;
}

export const SUGGESTED_COMMANDS = [
  "Show the cooking category.",
  "Compare these two.",
  "Show a cheaper option.",
  "Why did Maya reject this?",
  "Remove products with glass.",
  "Add this to the cart.",
  "Ask everyone for approval.",
];

const CART_ORDER = ["cooking", "safety", "comfort", "entertainment", "shared_essentials"];

export function cartProducts(state: AppState): Product[] {
  const products = state.catalog?.products ?? [];
  return state.cartIds.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => Boolean(p));
}

/** Groups cart items by category for display. Summing listed prices is presentation, not scoring. */
export function cartByCategory(items: Product[]) {
  const groups = new Map<string, Product[]>();
  for (const item of items) groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
  const rank = (c: string) => (CART_ORDER.includes(c) ? CART_ORDER.indexOf(c) : CART_ORDER.length);
  return [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b));
}

export function MissionSpaceScreen({ state, actions, scene }: ScreenProps) {
  const mission = state.mission;
  if (!mission) return null;
  const items = cartProducts(state);
  const total = items.reduce((sum, p) => sum + p.price, 0);
  const remaining = mission.sharedBudget - total;
  const groups = cartByCategory(items);
  const selected = state.catalog?.products.find((p) => p.id === state.selectedProductId);
  const current = state.recommendationAfter ?? state.recommendationBefore;
  const bundle = state.catalog?.bundles.find((b) => b.id === current?.selectedBundleId);

  return (
    <section className="space" aria-labelledby="space-title">
      <header className="space__top">
        <div>
          <p className="eyebrow">Cabin weekend</p>
          <h1 id="space-title" tabIndex={-1}>{mission.title}</h1>
        </div>
        <ul className="space__people" aria-label="People in this mission">
          {state.shoppers.map((s) => (
            <li key={s.id}>
              <Avatar avatarId={s.avatarId} name={s.name} size={28} />
              <span>{s.id === state.shopper?.id ? `${s.name} (you)` : s.name}</span>
            </li>
          ))}
        </ul>
        <p className="space__budget">
          <strong>{money(total)}</strong> of {money(mission.sharedBudget)}
          <span className={remaining < 0 ? "over" : ""}> · {remaining < 0 ? `${money(-remaining)} over budget` : `${money(remaining)} remaining`}</span>
        </p>
        <Progress state={state} />
      </header>

      <nav className="space__left" aria-label="Shopping categories">
        <h2 className="subhead">Categories</h2>
        <ul>
          <li>
            <button type="button" className={`cat${state.activeCategory === null ? " is-active" : ""}`} aria-pressed={state.activeCategory === null} onClick={() => actions.showCategory(null)}>
              Whole cart
            </button>
          </li>
          {groups.map(([category]) => (
            <li key={category}>
              <button type="button" className={`cat${state.activeCategory === category ? " is-active" : ""}`} aria-pressed={state.activeCategory === category} onClick={() => actions.showCategory(category)}>
                {categoryLabel(category)}
              </button>
            </li>
          ))}
        </ul>
        {state.hiddenMaterials.length > 0 && (
          <p className="tag tag--info">Hidden: products with {state.hiddenMaterials.join(", ")}</p>
        )}
      </nav>

      <div className="space__center">
        {scene}
        <section className="cart" aria-labelledby="cart-title">
          <h2 id="cart-title" className="cart__title">
            {state.recommendationAfter ? "Affinity built your first cabin cart" : "Current cabin cart"}
            {bundle && <span className="tag">{bundle.name}</span>}
          </h2>
          <table className="cart__table">
            <caption className="sr-only">Shared cart by category</caption>
            <tbody>
              {groups
                .filter(([category]) => !state.activeCategory || state.activeCategory === category)
                .map(([category, products]) => (
                  <tr key={category}>
                    <th scope="row">{categoryLabel(category)}</th>
                    <td>
                      <ul className="cart__items">
                        {products.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              className={`item${state.selectedProductId === p.id ? " is-selected" : ""}`}
                              aria-pressed={state.selectedProductId === p.id}
                              onClick={() => actions.selectProduct(state.selectedProductId === p.id ? null : p.id)}
                            >
                              {p.name}
                              {hasPhysicalControl(p) && <span className="item__badge">physical control</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="num">{money(products.reduce((sum, p) => sum + p.price, 0))}</td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td />
                <td className="num"><strong>{money(total)}</strong></td>
              </tr>
              <tr>
                <th scope="row">Budget remaining</th>
                <td />
                <td className="num">{money(remaining)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      </div>

      <aside className="space__right" aria-label="Details">
        <div className="panel-tabs" role="tablist" aria-label="Detail panels">
          {(["decision", "cart", "compare", "explain"] as const).map((panel) => (
            <button
              key={panel}
              type="button"
              role="tab"
              aria-selected={state.panel === panel}
              className={`tab${state.panel === panel ? " is-active" : ""}`}
              onClick={() => actions.setPanel(panel)}
            >
              {panel === "decision" ? "Decision" : panel === "cart" ? "Product" : panel === "compare" ? "Compare" : "Why"}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="panel">
          {state.panel === "decision" && <DecisionPanel state={state} />}
          {state.panel === "cart" && <ProductPanel state={state} actions={actions} product={selected} />}
          {state.panel === "compare" && <ComparePanel state={state} actions={actions} />}
          {state.panel === "explain" && <ExplainPanel state={state} />}
        </div>
      </aside>

      <footer className="space__bottom">
        <NextStep state={state} actions={actions} />
        <CommandBar state={state} actions={actions} />
      </footer>
    </section>
  );
}

function Progress({ state }: { state: AppState }) {
  const steps = [
    { label: "Brief", done: true },
    { label: "Shoppers", done: true },
    { label: "Cart", done: state.cartIds.length > 0 },
    { label: "Use check", done: state.leapCheck?.phase === "saved" },
    { label: "Savings", done: Boolean(state.substitution && state.substitution.status !== "paused") },
    { label: "Approval", done: state.approvalRequested },
  ];
  return (
    <ol className="steps" aria-label="Mission progress">
      {steps.map((s) => (
        <li key={s.label} className={s.done ? "is-done" : ""}>
          <span aria-hidden="true">{s.done ? "✓" : "○"}</span> {s.label}
          <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
        </li>
      ))}
    </ol>
  );
}

function shopperColumns(rec: Recommendation, shoppers: ShopperProfile[]) {
  const ids = [...new Set([...rec.individualScores.map((s) => s.shopperId), ...rec.rejectedBundles.map((r) => r.shopperId)])];
  return ids.map((id) => ({ id, name: nameFor(id, shoppers) }));
}

/** Screen 8: before/after is readable without narration — names, strike-through, and text labels. */
export function DecisionPanel({ state }: { state: AppState }) {
  const before = state.recommendationBefore;
  const after = state.recommendationAfter;
  const bundles = state.catalog?.bundles ?? [];
  const bundleName = (id: string | undefined) => bundles.find((b) => b.id === id)?.name ?? id ?? "—";
  if (!before) return <p>No recommendation yet.</p>;
  if (!after) {
    return (
      <div className="decision">
        <h2 className="decision__title">Current group pick</h2>
        <p className="decision__single">{bundleName(before.selectedBundleId)}</p>
        <p className="supporting">Guest joined without a shopper, so the pick reflects existing shoppers only.</p>
        <ul className="reasons">{before.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      </div>
    );
  }
  const changed = before.selectedBundleId !== after.selectedBundleId;
  const removal = after.rejectedBundles.find((r) => r.bundleId === before.selectedBundleId);
  const columns = shopperColumns(after, state.shoppers);
  const scoreFor = (bundleId: string, shopperId: string) => after.individualScores.find((s) => s.bundleId === bundleId && s.shopperId === shopperId)?.score;
  const rejectedBy = (bundleId: string, shopperId: string) => after.rejectedBundles.find((r) => r.bundleId === bundleId && r.shopperId === shopperId);

  return (
    <div className="decision" data-testid="decision-panel">
      <ScreenHeading level={2}>{changed ? "Your shopper changed the group decision" : "The group decision stayed the same"}</ScreenHeading>
      <div className="before-after">
        <div className={`ba-card ba-card--before${changed ? " is-replaced" : ""}`} data-testid="before-card">
          <p className="ba-card__label">Before you joined</p>
          <p className="ba-card__name">{bundleName(before.selectedBundleId)}</p>
          {removal && (
            <p className="ba-card__why">
              <span aria-hidden="true">✕ </span>Removed by {nameFor(removal.shopperId, state.shoppers)}’s rule: {ruleLabel(removal.violatedRequirement)}
            </p>
          )}
        </div>
        <span className="ba-arrow" aria-hidden="true">→</span>
        <div className="ba-card ba-card--after" data-testid="after-card">
          <p className="ba-card__label">After you joined</p>
          <p className="ba-card__name">{bundleName(after.selectedBundleId)}</p>
          <p className="ba-card__why"><span aria-hidden="true">✓ </span>Selected</p>
        </div>
      </div>
      <h3 className="subhead">Why</h3>
      <ul className="reasons">{after.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      <table className="scores">
        <caption>Each shopper’s result by bundle</caption>
        <thead>
          <tr>
            <th scope="col">Bundle</th>
            {columns.map((c) => <th key={c.id} scope="col">{c.name}</th>)}
            <th scope="col">Group result</th>
          </tr>
        </thead>
        <tbody>
          {bundles.map((b) => {
            const selected = b.id === after.selectedBundleId;
            const group = after.groupScores[b.id];
            return (
              <tr key={b.id} className={selected ? "is-selected" : ""}>
                <th scope="row">
                  {b.name.replace(" Cabin Bundle", "")}
                  {selected && <span className="tag tag--ok"> Selected</span>}
                </th>
                {columns.map((c) => {
                  const rejected = rejectedBy(b.id, c.id);
                  const score = scoreFor(b.id, c.id);
                  return (
                    <td key={c.id} className={rejected ? "rejected" : "num"}>
                      {rejected ? `Rejected (${ruleLabel(rejected.violatedRequirement)})` : score ?? "—"}
                    </td>
                  );
                })}
                <td className="num">{group === undefined ? "—" : selected ? <strong>{group}</strong> : group}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="caption">Scores and reasons come from Affinity’s engine; the group result favors the least-satisfied shopper.</p>
    </div>
  );
}

function ProductPanel({ state, actions, product }: { state: AppState; actions: Controller; product: Product | undefined }) {
  if (!product) return <p className="supporting">Select a product in the cart or on the table to inspect it.</p>;
  const offerLeap = hasPhysicalControl(product) && !state.leapOfferDismissed && state.leapCheck?.phase !== "saved";
  const reactions = reactionsFor(state, product);
  return (
    <div className="product-panel">
      <ProductImage product={product} size={120} />
      <h2>{product.name}</h2>
      <p>{money(product.price)} · {categoryLabel(product.category)}</p>
      <ul className="facts">
        {Object.entries(product.facts).map(([k, v]) => (
          <li key={k}>{k.replace(/([A-Z])/g, " $1").toLowerCase()}: {String(v)}</li>
        ))}
      </ul>
      {reactions.length > 0 && (
        <ul className="reactions" aria-label="Shopper reactions">
          {reactions.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
      {offerLeap && (
        <div className="leap-offer" role="region" aria-label="Optional interaction check">
          <p><strong>This shared product has a physical control.</strong></p>
          <p>Would you like to check how you naturally interact with it?</p>
          <div className="row">
            <button type="button" className="btn btn--primary" onClick={() => actions.startLeapCheck(product.id)}>Try it</button>
            <button type="button" className="btn" onClick={actions.dismissLeapOffer}>Skip</button>
          </div>
        </div>
      )}
      <div className="row">
        {state.cartIds.includes(product.id) ? (
          <button type="button" className="btn" onClick={() => actions.removeFromCart(product.id)}>Remove from cart</button>
        ) : (
          <button type="button" className="btn" onClick={() => actions.addToCart(product.id)}>Add to cart</button>
        )}
      </div>
    </div>
  );
}

/** One-line reactions: the engine's reasons for the selected bundle, per shopper. */
export function reactionsFor(state: AppState, _product?: Product): string[] {
  const rec = state.recommendationAfter ?? state.recommendationBefore;
  if (!rec) return [];
  return rec.individualScores
    .filter((s) => s.bundleId === rec.selectedBundleId && s.reasons.length)
    .map((s) => `${nameFor(s.shopperId, state.shoppers)}: ${s.reasons[0]}`);
}

function ComparePanel({ state, actions }: { state: AppState; actions: Controller }) {
  const products = state.catalog?.products ?? [];
  const pair = state.compareIds?.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => Boolean(p));
  if (!pair || pair.length < 2) return <p className="supporting">Say “Compare these two” or select a product and use Compare.</p>;
  const [a, b] = pair;
  const keys = [...new Set([...Object.keys(a.facts), ...Object.keys(b.facts)])];
  const cheaper = b.price < a.price;
  return (
    <div className="compare">
      <h2 className="subhead">Comparison tray</h2>
      <div className="compare__grid">
        {[a, b].map((p) => (
          <div key={p.id} className="compare__col">
            <ProductImage product={p} size={96} />
            <h3>{p.name}</h3>
            <p>{money(p.price)}</p>
            <p className="tag">{state.cartIds.includes(p.id) ? "In cart" : "Alternative"}</p>
          </div>
        ))}
      </div>
      <table className="scores">
        <caption className="sr-only">Facts side by side</caption>
        <tbody>
          {keys.map((k) => (
            <tr key={k}>
              <th scope="row">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</th>
              <td>{String(a.facts[k] ?? "—")}</td>
              <td>{String(b.facts[k] ?? "—")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        {cheaper && state.cartIds.includes(a.id) && (
          <button type="button" className="btn btn--primary" onClick={() => actions.findSavings(a.id, b.id)}>
            Swap in {b.name} (check everyone’s rules)
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => actions.compare(null)}>Close comparison</button>
      </div>
    </div>
  );
}

function ExplainPanel({ state }: { state: AppState }) {
  if (!state.explanation) return <p className="supporting">Ask “Why did Maya reject this?”</p>;
  return (
    <div>
      <h2 className="subhead">{nameFor(state.explanation.shopperId, state.shoppers)}’s shopper</h2>
      <ul className="reasons">{state.explanation.lines.map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
  );
}

function NextStep({ state, actions }: { state: AppState; actions: Controller }) {
  const press = state.cartIds.find((id) => hasPhysicalControl(state.catalog?.products.find((p) => p.id === id)));
  const leapDone = state.leapCheck?.phase === "saved" || state.leapOfferDismissed;
  const subDone = state.substitution && state.substitution.status !== "paused";
  let content: ReactNode;
  if (!leapDone && press) {
    content = (
      <>
        Next: inspect the product with a physical control.{" "}
        <button type="button" className="btn btn--small btn--primary" onClick={() => {
            actions.selectProduct(press);
            actions.setPanel("cart");
          }}>
          Select {state.catalog?.products.find((p) => p.id === press)?.name}
        </button>
      </>
    );
  } else if (!subDone) {
    content = (
      <>
        Next: let Affinity look for savings.{" "}
        <button type="button" className="btn btn--small btn--primary" onClick={() => actions.findSavings()}>Find savings</button>
      </>
    );
  } else {
    content = (
      <>
        Next:{" "}
        <button type="button" className="btn btn--small btn--primary" onClick={actions.requestApproval}>Ask everyone for approval</button>
      </>
    );
  }
  return <div className="next-step">{content}</div>;
}

function CommandBar({ state, actions }: { state: AppState; actions: Controller }) {
  const [text, setText] = useState("");
  return (
    <div className="command-bar">
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          actions.runCommand(text);
          setText("");
        }}
      >
        <PushToTalk compact label="Hold to give a command" onTranscript={(t, source) => source === "live" && setText(t)} />
        <label htmlFor="command-input" className="sr-only">Type a command</label>
        <input
          id="command-input"
          className="input command-input"
          placeholder="Type or speak a command, e.g. “Show the cooking category.”"
          value={text}
          onChange={(e) => setText(e.target.value)}
          list="command-suggestions"
        />
        <datalist id="command-suggestions">
          {SUGGESTED_COMMANDS.map((c) => <option key={c} value={c} />)}
        </datalist>
        <button type="submit" className="btn btn--primary" disabled={!text.trim() || Boolean(state.busy)}>Run</button>
      </form>
      <div className="command-chips" aria-label="Suggested commands">
        {SUGGESTED_COMMANDS.map((c) => (
          <button key={c} type="button" className="chip chip--button" disabled={Boolean(state.busy)} onClick={() => actions.runCommand(c)}>
            {c}
          </button>
        ))}
      </div>
      <ol className="transcript-log" aria-label="Command transcript" aria-live="polite">
        {state.voiceLog.map((entry, i) => (
          <li key={i}>
            <span className="transcript-log__you">You: “{entry.transcript}”</span>
            <span className="transcript-log__reply">Affinity: {entry.response}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
