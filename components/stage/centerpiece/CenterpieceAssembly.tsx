"use client";

import { useEffect, useRef } from "react";
import type { Group } from "three";
import { CENTERPIECE } from "@/lib/stage/layout";
import { useStage } from "@/lib/stage/store";
import { registerTarget } from "@/lib/stage/targets";
import { groupBySlot, pedestalLayout, slotOrder } from "./itemGrouping";
import { SlotPedestal } from "./SlotPedestal";

/** Renders the bundle's items grouped by slot on a row of pedestals, replacing the Christmas tree. */
export function CenterpieceAssembly() {
  const bundle = useStage((state) => state.bundle);
  const root = useRef<Group>(null);

  useEffect(() => {
    const group = root.current;
    if (!group) return;
    return registerTarget("centerpiece", group, 1.4);
  }, []);

  if (!bundle || bundle.items.length === 0) return null;

  const order = slotOrder(bundle.items);
  const groups = groupBySlot(bundle.items);
  const positions = pedestalLayout(order.length);

  return (
    <group ref={root} position={CENTERPIECE.position}>
      {order.map((slot, index) => (
        <SlotPedestal key={slot} slot={slot} items={groups.get(slot) ?? []} position={positions[index]!} />
      ))}
    </group>
  );
}
