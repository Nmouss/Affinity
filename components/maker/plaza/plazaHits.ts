import type { Object3D } from "three";

// Registry of each Plaza person's invisible hit mesh. PlazaPointer raycasts against real meshes
// (for correct depth/occlusion between overlapping people) without prop-drilling refs down through
// PlazaCrowd's mapped list; each PlazaPerson registers on mount and unregisters on unmount.

const hits = new Map<string, Object3D>();

export function registerHit(id: string, object: Object3D): void {
  object.userData.plazaPersonId = id;
  hits.set(id, object);
}

export function unregisterHit(id: string): void {
  hits.delete(id);
}

/** Every registered hit mesh, for Raycaster.intersectObjects. Allocates an array (registration
 * changes rarely, once per person mount/unmount) but never per frame beyond that. */
export function getHitObjects(): Object3D[] {
  return Array.from(hits.values());
}

/** Walks up from a raycast hit's object to find which person it belongs to. */
export function hitPersonId(object: Object3D | null | undefined): string | null {
  let node: Object3D | null | undefined = object;
  while (node) {
    const id = node.userData.plazaPersonId;
    if (typeof id === "string") return id;
    node = node.parent;
  }
  return null;
}
