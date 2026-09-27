"use client";

import { tokens } from "@/lib/director/attribution";
import type { CatalogItem, ConstraintSet, FamilyProfile, HouseRule, SpriteOpinion } from "@/types/domain";
import type { ConflictAttribution } from "@/types/stage";
import styles from "./ConstraintBoard.module.css";

export interface ConstraintBoardProps {
  /** The merge result, when it has arrived. Before that the board fills from the opinions. */
  constraints: ConstraintSet | null;
  opinions: Record<string, SpriteOpinion>;
  veto: ConstraintSet["conflicts"][number] | null;
  conflict: ConflictAttribution | null;
  family: FamilyProfile[];
  catalog: CatalogItem[];
}

interface RuleRow {
  rule: HouseRule;
  by: string | null;
}

function describeRule(rule: HouseRule): string {
  if (rule.type === "maxHeight") return `Max height ${rule.inches ?? "?"} in (${((rule.inches ?? 0) / 12).toFixed(0)} ft)`;
  return `No “${rule.tag ?? "?"}”`;
}

const sameRule = (a: HouseRule, b: HouseRule) => a.type === b.type && a.inches === b.inches && a.tag === b.tag;

function collectRules(constraints: ConstraintSet | null, opinions: Record<string, SpriteOpinion>): RuleRow[] {
  const declared = Object.values(opinions).flatMap((opinion) =>
    opinion.hardRules.map((rule) => ({ rule, by: opinion.spriteId })),
  );
  if (!constraints) {
    return declared.filter((row, index) => declared.findIndex((other) => sameRule(other.rule, row.rule)) === index);
  }
  return constraints.hardRules.map((rule) => ({
    rule,
    by: declared.find((row) => sameRule(row.rule, rule))?.by ?? null,
  }));
}

function collectWishes(constraints: ConstraintSet | null, opinions: Record<string, SpriteOpinion>) {
  if (constraints) return constraints.wishes;
  return Object.values(opinions).flatMap((opinion) =>
    opinion.wishes.map((wish) => ({ spriteId: opinion.spriteId, wish, weight: 1 })),
  );
}

/** Hard rules on the left, wishes on the right, the veto stamped between them. */
export function ConstraintBoard({ constraints, opinions, veto, conflict, family, catalog }: ConstraintBoardProps) {
  const profile = (id: string | null) => family.find((member) => member.id === id);
  const rules = collectRules(constraints, opinions);
  const wishes = collectWishes(constraints, opinions);
  const vetoTokens = veto ? tokens(veto.wish) : null;
  const isVetoed = (spriteId: string, wish: string) => {
    if (!vetoTokens || (conflict?.wishBy && conflict.wishBy !== spriteId)) return false;
    const wishTokens = tokens(wish);
    let shared = 0;
    for (const token of wishTokens) if (vetoTokens.has(token)) shared += 1;
    return shared >= Math.min(2, wishTokens.size);
  };
  const itemName = (id: string | null | undefined) => catalog.find((item) => item.id === id)?.name;

  return (
    <aside className={styles.board} aria-label="Constraint board">
      <h2 className={styles.heading}>Constraint board</h2>
      <div className={styles.columns}>
        <section className={styles.rules}>
          <h3 className={styles.sub}>House rules</h3>
          {rules.length === 0 && <p className={styles.empty}>No hard rules yet</p>}
          <ul className={styles.list}>
            {rules.map(({ rule, by }, index) => (
              <li key={index} className={styles.rule}>
                <strong>{describeRule(rule)}</strong>
                <span className={styles.meta}>
                  {profile(by)?.name ?? "Household"} · {rule.why}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.middle} aria-live="polite">
          {veto ? (
            <div className={styles.stamp}>
              <span className={styles.stampWord}>Veto</span>
              <span className={styles.stampLine}>{itemName(conflict?.itemId) ?? veto.wish}</span>
              <span className={styles.arrow} aria-hidden>
                ↓
              </span>
              <span className={styles.stampLine}>{itemName(conflict?.resolvedItemId) ?? veto.resolution}</span>
              <span className={styles.meta}>
                {profile(conflict?.ruleBy ?? null)?.name ?? "A house rule"} vs {profile(conflict?.wishBy ?? null)?.name ?? "a wish"}
              </span>
            </div>
          ) : (
            <span className={styles.vs} aria-hidden>
              ⚖
            </span>
          )}
        </section>

        <section className={styles.wishes}>
          <h3 className={styles.sub}>Wishes</h3>
          {wishes.length === 0 && <p className={styles.empty}>Listening…</p>}
          <ul className={styles.list}>
            {wishes.map(({ spriteId, wish }, index) => {
              const member = profile(spriteId);
              const vetoed = isVetoed(spriteId, wish);
              return (
                <li key={`${spriteId}-${index}`} className={vetoed ? styles.vetoed : styles.wish}>
                  <span className={styles.dot} style={{ background: member?.colors[0] ?? "#ffd18a" }} aria-hidden />
                  <span>{wish}</span>
                  <span className={styles.meta}>{member?.name ?? spriteId}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </aside>
  );
}
