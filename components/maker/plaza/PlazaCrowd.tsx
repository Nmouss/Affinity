"use client";

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { getAgents, resolveOverlaps } from "@/lib/people/crowd";
import { usePeople, useRoster } from "@/lib/people/roster";
import { formationSlots, missionCircleSlots, sortForWhistle } from "./formation";
import { formationForPicks } from "./giftPick";
import { GiftRoleMarkers } from "./GiftRoleMarkers";
import { PlazaPerson } from "./PlazaPerson";
import { usePlaza } from "./plazaState";

// Maps the roster onto PlazaPerson, computes the whistle's formation slots when it's on, and owns
// the single per-frame resolveOverlaps() call for the "plaza" crowd.
//
// Ordering: React commits a component's children's layout effects before its own (bottom-up), and
// useFrame subscribes from one of those effects, so every PlazaPerson below has already subscribed
// (and therefore already moved this frame) by the time this component's own useFrame callback runs
// — same render priority (the default, 0) is a stable sort that preserves that registration order.
// That makes this the correct single owner for resolveOverlaps: it always sees this frame's fully
// moved agents before nudging overlapping ones apart for the next frame.
export function PlazaCrowd() {
  const people = usePeople();
  const circles = useRoster((state) => state.circles);
  const whistleOn = usePlaza((state) => state.whistle.on);
  const sort = usePlaza((state) => state.whistle.sort);
  const missionMemberIds = usePlaza((state) => state.missionMemberIds);
  const giftPick = usePlaza((state) => state.giftPick);
  const missionCircleOpen = usePlaza((state) => state.missionMode === "plan");

  const slots = useMemo(() => {
    // Picking a gift's people lines everyone up around the picks; otherwise the whistle decides.
    if (giftPick) return formationForPicks(people.map((person) => person.id), giftPick);
    if (!whistleOn) return null;
    const order = sortForWhistle(people, circles, sort);
    return formationSlots(order, circles, sort);
  }, [giftPick, whistleOn, sort, people, circles]);
  const missionSlots = useMemo(
    () =>
      missionCircleOpen
        ? missionCircleSlots(missionMemberIds.filter((id) => people.some((person) => person.id === id)))
        : {},
    [missionCircleOpen, missionMemberIds, people],
  );

  useFrame(() => {
    resolveOverlaps(getAgents("plaza"));
  });

  return (
    <group>
      {people.map((profile) => (
        <PlazaPerson
          key={profile.id}
          profile={profile}
          formationSlot={slots?.[profile.id] ?? null}
          missionSlot={missionSlots[profile.id] ?? null}
          missionCircleOpen={missionCircleOpen}
        />
      ))}
      {giftPick && <GiftRoleMarkers pick={giftPick} />}
    </group>
  );
}
