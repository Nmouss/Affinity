"use client";

import { Effects } from "@/components/stage/fx/Effects";
import { DecoyGhosts } from "@/components/stage/tree/DecoyGhosts";
import { HeightRuler } from "@/components/stage/tree/HeightRuler";
import { OrnamentFlights } from "@/components/stage/tree/OrnamentFlights";
import { TreeAssembly } from "@/components/stage/tree/TreeAssembly";
import { VetoBeat } from "@/components/stage/tree/VetoBeat";
import { CameraRig } from "./CameraRig";
import { Furniture, Rug } from "./Furniture";
import { Hearth } from "./Hearth";
import { Lighting } from "./Lighting";
import { RoomShell } from "./RoomShell";
import { SceneDirector } from "./SceneDirector";

/** The living room: shell, hearth, rug, furniture, the tree corner and its beats, camera, and post. */
export function RoomLayer() {
  return (
    <group>
      <SceneDirector />
      <CameraRig />
      <Lighting />
      <RoomShell />
      <Hearth />
      <Rug />
      <Furniture />
      <HeightRuler />
      <DecoyGhosts />
      <VetoBeat />
      <TreeAssembly />
      <OrnamentFlights />
      <Effects />
    </group>
  );
}
