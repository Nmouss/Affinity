"use client";

import { useEffect, useMemo, useState } from "react";
import { TreeAssembly } from "@/components/stage/tree/TreeAssembly";
import { itemIdOf } from "@/lib/gestures/hitTest";
import { pedestalInspectTarget, pedestalPositions } from "@/lib/product/layout";
import { isTreeBundle } from "@/lib/product/media";
import { onGesture } from "@/lib/stage/bus";
import { useStage } from "@/lib/stage/store";
import type { Bundle } from "@/types/domain";
import { ProductPedestal } from "./ProductPedestal";

/** Gift products on pedestals inside the council ring; a pinch/click focuses one for inspection. */
function GiftPedestals({ bundle }: { bundle: Bundle }) {
  const items = bundle.items;
  const positions = useMemo(() => pedestalPositions(items.length), [items.length]);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  useEffect(
    () =>
      onGesture((event) => {
        if (event.type !== "pinchTap") return;
        const id = itemIdOf(event.target);
        if (id && items.some((item) => item.id === id)) setFocusedId((current) => (current === id ? null : id));
      }),
    [items],
  );

  // The inspect camera orbits the focused pedestal, or the first one until something is picked.
  useEffect(() => {
    const index = Math.max(0, focusedId ? items.findIndex((item) => item.id === focusedId) : 0);
    const position = positions[index];
    if (position) useStage.getState().setScene({ inspectTarget: pedestalInspectTarget(position) });
  }, [focusedId, items, positions]);

  return (
    <group>
      {items.map((item, index) => (
        <ProductPedestal
          key={item.id}
          item={item}
          index={index}
          position={positions[index] ?? positions[0]!}
          focused={focusedId === item.id}
        />
      ))}
    </group>
  );
}

/**
 * Renders whatever the council proposed: the Christmas-tree assembly for the known local tree
 * slots, pedestals for anything else (Shopify gifts, the local gift catalog).
 */
export function ProposalDisplay() {
  const bundle = useStage((state) => state.bundle);
  if (!bundle) return null;
  if (isTreeBundle(bundle)) return <TreeAssembly />;
  return <GiftPedestals key={bundle.items.map((item) => item.id).join("|")} bundle={bundle} />;
}
