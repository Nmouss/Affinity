import type { Metadata } from "next";
import { MissionPage } from "@/components/mission/MissionPage";

export const metadata: Metadata = {
  title: "Affinity · Group mission",
  description: "Plan a shared cart with the people you're shopping for.",
};

// The group-shopping mission flow. MissionPage loads the app with next/dynamic ssr:false (it reads
// window, Web Speech, WebGL, and the Leap socket), mirroring components/stage/AffinityStage.tsx.
export default function Page() {
  return <MissionPage />;
}
