import { CouncilHandoff } from "@/components/home/CouncilHandoff";
import { AffinityStage } from "@/components/stage/AffinityStage";

// The living-room Shopping Council. Arriving from the Plaza home with a gift mission seats the
// chosen characters and convenes automatically; `?demo` plays the recorded tree council from the
// lobby as before.
export default function CouncilPage() {
  return (
    <main>
      <AffinityStage />
      <CouncilHandoff />
    </main>
  );
}
