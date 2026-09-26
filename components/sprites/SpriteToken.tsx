import type { FamilyProfile } from "@/types/domain";

export interface SpriteTokenProps { profile: FamilyProfile; selected?: boolean }

export function SpriteToken({ profile, selected = false }: SpriteTokenProps) {
  return <button aria-pressed={selected}>{profile.name}</button>;
}
