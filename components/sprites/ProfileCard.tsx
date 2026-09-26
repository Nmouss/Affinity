import type { FamilyProfile } from "@/types/domain";

export function ProfileCard({ profile }: { profile: FamilyProfile }) {
  return <aside><h2>{profile.name}</h2><p>{profile.loves.join(", ")}</p></aside>;
}
