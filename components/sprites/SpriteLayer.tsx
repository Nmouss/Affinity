"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CouncilRing } from "@/components/council/CouncilRing";
import { usePeople, useCircle } from "@/lib/people/roster";
import { useStage } from "@/lib/stage/store";
import { SpriteLab } from "./SpriteLab";
import { SpriteToken } from "./SpriteToken";

// Long enough for a sprite to walk from a guest spot (or a seat) to the doorway before it's dropped.
const LEAVE_MS = 2400;

// The sprites track's layer: one token per family member (always present) plus visiting friends
// (present only while invited), and the council ring seats. A friend who stops visiting (reset, or
// sent home) keeps rendering for LEAVE_MS so SpriteToken can walk it out to the doorway first.
export function SpriteLayer() {
  const people = usePeople();
  const family = useCircle("family");
  const visitors = useStage((state) => state.visitors);
  const [leaving, setLeaving] = useState<string[]>([]);
  const prevVisitors = useRef<string[]>(visitors);

  useEffect(() => {
    const dropped = prevVisitors.current.filter((id) => !visitors.includes(id));
    prevVisitors.current = visitors;
    if (dropped.length === 0) return undefined;
    setLeaving((current) => [...current, ...dropped]);
    const timer = window.setTimeout(() => {
      setLeaving((current) => current.filter((id) => !dropped.includes(id)));
    }, LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [visitors]);

  const profiles = useMemo(() => {
    const familyIds = new Set(family.map((profile) => profile.id));
    const visible = new Set([...visitors, ...leaving]);
    return people.filter((profile) => familyIds.has(profile.id) || visible.has(profile.id));
  }, [people, family, visitors, leaving]);

  return (
    <group>
      <CouncilRing />
      {profiles.map((profile) => (
        <SpriteToken key={profile.id} profile={profile} />
      ))}
      <SpriteLab />
    </group>
  );
}
