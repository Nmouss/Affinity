"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getHitObjects, hitPersonId } from "./plazaHits";
import { ndcToClientPx, shouldStartDrag } from "./plazaPick";
import { plazaPointerFloor, signalDragOutcome } from "./plazaSignals";
import { PLAZA_DROP_ATTR, usePlaza, type PlazaDrop } from "./plazaState";

// Turns usePlaza's single pointer (mouse today, written by MakerCanvas; the hand track feeds the
// same field) into hover, tap/select, and drag/drop against the registered PlazaPerson hit
// capsules and the DOM rail buttons. Renders nothing — MakerCanvas wires the mouse's native
// pointer events into the store; this only reads it every frame.

const raycaster = new THREE.Raycaster();
const ndcScratch = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const groundScratch = new THREE.Vector3();

interface Press {
  /** Whoever was hovered the instant the grab started; null presses only ever resolve to a tap
   * that clears the selection (an empty-floor grab can never become a drag). */
  id: string | null;
  atMs: number;
  ndcX: number;
  ndcY: number;
  /** Last pointer seen during the press. The release clears the store's pointer (the canvas loses
   * pointer capture) before this frame runs, so the drop hit-tests here instead. */
  lastX: number;
  lastY: number;
}

export function PlazaPointer() {
  const { camera, size } = useThree();
  const press = useRef<Press | null>(null);

  useFrame((state) => {
    const store = usePlaza.getState();
    const pointer = store.pointer;

    if (pointer) {
      ndcScratch.set(pointer[0], pointer[1]);
      raycaster.setFromCamera(ndcScratch, camera);

      if (raycaster.ray.intersectPlane(groundPlane, groundScratch)) {
        plazaPointerFloor.x = groundScratch.x;
        plazaPointerFloor.z = groundScratch.z;
      }

      if (store.draggingId === null) {
        const hits = raycaster.intersectObjects(getHitObjects(), false);
        const newHoveredId = hits.length > 0 ? hitPersonId(hits[0]!.object) : null;
        if (newHoveredId !== store.hoveredId) store.setHovered(newHoveredId);
      }
    } else if (store.hoveredId !== null && store.draggingId === null) {
      store.setHovered(null);
    }

    const nowMs = state.clock.elapsedTime * 1000;
    const current = press.current;

    if (store.grabbing && !current) {
      const x = pointer?.[0] ?? 0;
      const y = pointer?.[1] ?? 0;
      press.current = { id: store.hoveredId, atMs: nowMs, ndcX: x, ndcY: y, lastX: x, lastY: y };
    } else if (store.grabbing && current && pointer) {
      current.lastX = pointer[0];
      current.lastY = pointer[1];
    }
    if (store.grabbing && current && store.draggingId === null && current.id) {
      const movedNdc = pointer ? Math.hypot(pointer[0] - current.ndcX, pointer[1] - current.ndcY) : 0;
      if (shouldStartDrag(nowMs - current.atMs, movedNdc)) store.setDragging(current.id);
    } else if (!store.grabbing && current) {
      if (store.draggingId !== null) {
        const draggedId = store.draggingId;
        const px = pointer?.[0] ?? current.lastX;
        const py = pointer?.[1] ?? current.lastY;
        const [cx, cy] = ndcToClientPx([px, py], size.width, size.height);
        const el = typeof document !== "undefined" ? document.elementFromPoint(cx, cy) : null;
        const dropTarget = el?.closest(`[${PLAZA_DROP_ATTR}]`) as HTMLElement | null;
        const dropValue = dropTarget?.getAttribute(PLAZA_DROP_ATTR) as PlazaDrop | null;
        if (dropValue) {
          signalDragOutcome(draggedId, "icon");
          store.requestDrop(dropValue, draggedId);
        } else {
          signalDragOutcome(draggedId, "floor");
        }
        store.setDragging(null);
      } else {
        store.select(current.id);
      }
      press.current = null;
    }
  });

  return null;
}
