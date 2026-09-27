"use client";

import { Effects } from "@/components/stage/fx/Effects";
import { isTreeBundle } from "@/lib/product/media";
import { useStage } from "@/lib/stage/store";
import { DecoyGhosts } from "@/components/stage/tree/DecoyGhosts";
import { HeightRuler } from "@/components/stage/tree/HeightRuler";
import { OrnamentFlights } from "@/components/stage/tree/OrnamentFlights";
import { ProposalDisplay } from "@/components/stage/product/ProposalDisplay";
import { VetoBeat } from "@/components/stage/tree/VetoBeat";
import { CameraRig } from "./CameraRig";
import { Furniture, Rug } from "./Furniture";
import { Hearth } from "./Hearth";
import { Lighting } from "./Lighting";
import { RoomShell } from "./RoomShell";
import { SceneDirector } from "./SceneDirector";

/** The living room: shell, hearth, rug, furniture, the proposal (tree corner or gift pedestals) and its beats, camera, and post. */
export function RoomLayer() {
  // The height ruler and the too-tall decoy ghosts explain the tree's maxHeight rule; they are noise
  // next to a gift on a pedestal.
  const missionType = useStage((state) => state.mission?.type);
  const bundle = useStage((state) => state.bundle);
  const treeScene = missionType !== "gift" && (bundle === null || isTreeBundle(bundle));
  return (
    <group>
      <SceneDirector />
      <CameraRig />
      <Lighting />
      <RoomShell />
      <Hearth />
      <Rug />
      <Furniture />
      {treeScene && <HeightRuler />}
      {treeScene && <DecoyGhosts />}
      <VetoBeat />
      <ProposalDisplay />
      <OrnamentFlights />
      <Effects />
    </group>
  );
}
