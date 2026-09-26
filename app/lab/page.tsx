import { AffinityStage } from "@/components/stage/AffinityStage";

// Development page: the full stage plus leva, stats, and the transcript stepper.
export default function LabPage() {
  return (
    <main>
      <AffinityStage lab />
    </main>
  );
}
