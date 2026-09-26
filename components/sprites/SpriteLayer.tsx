"use client";

import { CouncilRing } from "@/components/council/CouncilRing";
import { FAMILY } from "@/lib/stage/slices/council";
import { SpriteLab } from "./SpriteLab";
import { SpriteToken } from "./SpriteToken";

// The sprites track's layer: one token per family member plus the council ring seats.
export function SpriteLayer() {
  return (
    <group>
      <CouncilRing />
      {FAMILY.map((profile) => (
        <SpriteToken key={profile.id} profile={profile} />
      ))}
      <SpriteLab />
    </group>
  );
}
