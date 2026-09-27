"use client";

import { Effects } from "@/components/stage/fx/Effects";
import { CenterpieceAssembly } from "@/components/stage/centerpiece/CenterpieceAssembly";
import { useStage } from "@/lib/stage/store";
import { CameraRig } from "./CameraRig";
import { Rug } from "./Furniture";
import { Hearth } from "./Hearth";
import { Lighting } from "./Lighting";
import { RoomShell } from "./RoomShell";
import { SceneDirector } from "./SceneDirector";

/** The living room: shell (with its environment preset), hearth, rug, the bundle's centerpiece, camera, and post. */
export function RoomLayer() {
  const environment = useStage((state) => state.scene.environment);
  return (
    <group>
      <SceneDirector />
      <CameraRig />
      <Lighting />
      <RoomShell environment={environment} />
      <Hearth />
      <Rug />
      <CenterpieceAssembly />
      <Effects />
    </group>
  );
}
