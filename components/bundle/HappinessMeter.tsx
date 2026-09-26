export function HappinessMeter({ name, score }: { name: string; score: number }) {
  return <label>{name}<meter min={0} max={10} value={score}>{score}/10</meter></label>;
}
