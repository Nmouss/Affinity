"use client";

import { useEffect, useRef } from "react";
import { ProductImage, ScreenHeading } from "@/components/mission/common";
import type { Controller } from "@/lib/mission/state/controller";
import { money, nameFor, ruleLabel } from "@/lib/mission/state/labels";
import type { AppState } from "@/lib/mission/state/machine";

interface ScreenProps {
  state: AppState;
  actions: Controller;
}

/** Screen 10. Amber = paused, red = the conflicting requirement, green = compatible approval. Text says it too. */
export function SubstitutionScreen({ state, actions }: ScreenProps) {
  const sub = state.substitution;
  const statusRef = useRef<HTMLDivElement>(null);
  const firstStatus = useRef(sub?.status);
  // When the status changes, the button that caused it is gone; keep keyboard focus on the outcome.
  useEffect(() => {
    if (sub?.status !== firstStatus.current) statusRef.current?.focus();
  }, [sub?.status]);
  if (!sub) return null;
  const products = state.catalog?.products ?? [];
  const current = products.find((p) => p.id === sub.currentProductId);
  const replacement = products.find((p) => p.id === sub.replacementProductId);
  const affected = sub.result.affectedShopperId ? nameFor(sub.result.affectedShopperId, state.shoppers) : null;
  const askAction = sub.result.actions.find((a) => a.startsWith("ask_"));

  return (
    <section className="screen screen--narrow substitution">
      <p className="eyebrow">Savings check</p>
      <ScreenHeading>Affinity found an alternative that saves {money(sub.savings)}.</ScreenHeading>
      <div className="swap">
        {current && (
          <figure>
            <ProductImage product={current} size={96} />
            <figcaption>{current.name}<br />{money(current.price)}</figcaption>
          </figure>
        )}
        <span aria-hidden="true" className="swap__arrow">→</span>
        {replacement && (
          <figure>
            <ProductImage product={replacement} size={96} />
            <figcaption>{replacement.name}<br />{money(replacement.price)}</figcaption>
          </figure>
        )}
      </div>

      {(sub.status === "paused" || sub.status === "asked") && (
        <div className="status-card status-card--paused" role="alert">
          <p className="status-card__title"><span aria-hidden="true">⏸ </span>Substitution paused</p>
          <p className="status-card__message">{sub.result.message}</p>
          {sub.result.violatedRequirement && (
            <p className="conflict">
              <span aria-hidden="true">⚠ </span>Conflicts with {affected ? `${affected}’s` : "a"} confirmed requirement: <strong>{ruleLabel(sub.result.violatedRequirement)}</strong>
            </p>
          )}
          {sub.status === "asked" && (
            <p ref={statusRef as unknown as React.RefObject<HTMLParagraphElement>} tabIndex={-1} className="tag tag--info" role="status">Asked {affected ?? "the affected shopper"} to review (mock — no message sent). Still paused.</p>
          )}
          <div className="row">
            {sub.result.actions.includes("choose_alternative") && (
              <button type="button" className="btn btn--primary btn--large" disabled={Boolean(state.busy)} onClick={actions.chooseCompatibleAlternative}>
                Choose compatible alternative
              </button>
            )}
            {askAction && (
              <button type="button" className="btn btn--large" disabled={sub.status === "asked"} onClick={actions.askAffected}>
                Ask {affected ?? "them"}
              </button>
            )}
            {sub.result.actions.includes("override_with_approval") && (
              <button type="button" className="btn btn--large btn--danger" onClick={actions.requestOverride}>
                Override with approval
              </button>
            )}
          </div>
        </div>
      )}

      {sub.status === "alternative_approved" && (
        <div ref={statusRef} tabIndex={-1} className="status-card status-card--ok" role="status">
          <p className="status-card__title"><span aria-hidden="true">✓ </span>Compatible alternative approved</p>
          <p>{sub.result.message}</p>
        </div>
      )}
      {sub.status === "allowed" && (
        <div ref={statusRef} tabIndex={-1} className="status-card status-card--ok" role="status">
          <p className="status-card__title"><span aria-hidden="true">✓ </span>Substitution allowed</p>
          <p>{sub.result.message}</p>
        </div>
      )}
      {sub.status === "overridden" && (
        <div ref={statusRef} tabIndex={-1} className="status-card status-card--override" role="status">
          <p className="status-card__title"><span aria-hidden="true">! </span>Overridden with your approval</p>
          <p>{replacement?.name} replaces {current?.name}, even though it conflicts with {affected ?? "a shopper"}’s requirement. This is recorded on the cart.</p>
        </div>
      )}

      {sub.status !== "paused" && sub.status !== "asked" && (
        <div className="row">
          <button type="button" className="btn btn--primary btn--large" onClick={actions.requestApproval}>Ask everyone for approval</button>
          <button type="button" className="btn" onClick={actions.backToSpace}>Back to mission</button>
        </div>
      )}
      {(sub.status === "paused" || sub.status === "asked") && (
        <button type="button" className="btn btn--ghost" onClick={actions.backToSpace}>Keep current item and go back</button>
      )}
    </section>
  );
}

export function CompleteScreen({ state, actions }: ScreenProps) {
  const total = state.cartIds
    .map((id) => state.catalog?.products.find((p) => p.id === id)?.price ?? 0)
    .reduce((a, b) => a + b, 0);
  const others = state.shoppers.filter((s) => s.id !== state.shopper?.id).map((s) => s.name);
  return (
    <section className="screen screen--narrow complete">
      <ScreenHeading>Approval requested</ScreenHeading>
      <p className="tag tag--info">Mock authorization — no payment was made</p>
      <p>
        Shared cart: <strong>{money(total)}</strong>
        {state.mission && <> of {money(state.mission.sharedBudget)}</>}
      </p>
      <p>Waiting on: {others.join(", ") || "the group"}</p>
      {state.substitution?.status === "overridden" && <p className="conflict">Includes one override you approved.</p>}
      <p className="promise">Affinity learns each shopper’s taste, respects every rule, and never spends without a human saying yes.</p>
      <button type="button" className="btn btn--large" onClick={actions.startOver}>Start a new mission</button>
    </section>
  );
}
