export function MandateButton({ onApprove }: { onApprove: () => void }) {
  return <button onClick={onApprove}>Hold Space to approve</button>;
}
