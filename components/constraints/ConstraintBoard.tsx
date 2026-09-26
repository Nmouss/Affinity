import type { ConstraintSet } from "@/types/domain";

export function ConstraintBoard({ constraints }: { constraints: ConstraintSet }) {
  return <aside><h2>House rules</h2><pre>{JSON.stringify(constraints, null, 2)}</pre></aside>;
}
