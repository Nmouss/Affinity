import { Component, type ReactNode, Suspense, useCallback, useRef, useState } from "react";
import type { CompactFrame } from "../../../leap-bridge";
import { useLeapFrames, useLeapStatus } from "../leap/leapStore";
import type { Product } from "../services/contracts";
import type { Controller } from "../state/controller";
import { categoryLabel } from "../state/labels";
import type { AppState } from "../state/machine";
import { cartByCategory, cartProducts, reactionsFor } from "../screens/MissionSpace";
import MissionTable, { type SceneShopper } from "./MissionTable";

const SEAT_COLORS = ["#3f6b52", "#d9913b", "#9a5b8f", "#5b7fb0"];
const ROTATE_STEP = Math.PI / 6;

let webglCache: boolean | null = null;
export function webglAvailable(): boolean {
  if (webglCache !== null) return webglCache;
  try {
    const canvas = document.createElement("canvas");
    webglCache = Boolean(window.WebGLRenderingContext && (canvas.getContext("webgl2") || canvas.getContext("webgl")));
  } catch {
    webglCache = false;
  }
  return webglCache;
}

class SceneBoundary extends Component<{ fallback: (error: string) => ReactNode; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : "unknown error" };
  }
  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}

interface Props {
  state: AppState;
  actions: Controller;
  reducedMotion: boolean;
}

/** Picks what the center of the table shows: the selection, else the product with a physical control. */
function featuredProduct(state: AppState): Product | null {
  const products = state.catalog?.products ?? [];
  const byId = (id: string | null | undefined) => products.find((p) => p.id === id) ?? null;
  const selected = byId(state.selectedProductId);
  if (selected?.modelUrl) return selected;
  return cartProducts(state).find((p) => p.modelUrl) ?? selected;
}

export function SceneSlot({ state, actions, reducedMotion }: Props) {
  const [mode, setMode] = useState<"3d" | "2d">(() => (webglAvailable() ? "3d" : "2d"));
  const [inspect, setInspect] = useState(false);
  const yawRef = useRef(0);
  const [yawLabel, setYawLabel] = useState(0);
  const leap = useLeapStatus();
  const pinchWas = useRef(false);

  const items = cartProducts(state);
  const groups = cartByCategory(items);
  const categories = groups.map(([id, products]) => ({
    id,
    label: categoryLabel(id),
    total: products.reduce((s, p) => s + p.price, 0),
    productIds: products.map((p) => p.id),
  }));
  const featured = featuredProduct(state);
  const products = state.catalog?.products ?? [];
  const compare = state.compareIds
    ? (state.compareIds.map((id) => products.find((p) => p.id === id)).filter(Boolean) as Product[])
    : null;
  const reactions = reactionsFor(state);
  const shoppers: SceneShopper[] = state.shoppers.map((s, i) => ({
    id: s.id,
    name: s.id === state.shopper?.id ? `${s.name} (you)` : s.name,
    color: SEAT_COLORS[i % SEAT_COLORS.length],
    reaction: reactions.find((r) => r.startsWith(`${s.name}:`))?.slice(s.name.length + 2),
  }));

  const rotate = (delta: number) => {
    yawRef.current += delta;
    setYawLabel(Math.round((yawRef.current * 180) / Math.PI));
  };

  // Leap: palm x sets turntable yaw; a pinch toggles inspect. Mouse and buttons keep working.
  const onLeapFrame = useCallback((frame: CompactFrame) => {
    const hand = frame.hands[0];
    if (!hand) return;
    yawRef.current = Math.max(-Math.PI, Math.min(Math.PI, (hand.palm[0] / 150) * Math.PI));
    const pinching = hand.pinch > 0.85;
    if (pinching && !pinchWas.current) setInspect((v) => !v);
    pinchWas.current = pinching;
  }, []);
  useLeapFrames(mode === "3d" && leap === "open" ? onLeapFrame : null);

  const fallback2d = (reason?: string) => (
    <TableView2D state={state} actions={actions} categories={categories} shoppers={shoppers} featured={featured} reason={reason} />
  );

  return (
    <section className="scene" aria-label="Mission table">
      <div
        className="scene__stage"
        tabIndex={0}
        role="application"
        aria-roledescription="3D mission table"
        aria-label={`Mission table. ${featured ? `${featured.name} in the center.` : ""} Use arrow keys to rotate, Enter to inspect.`}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") rotate(-ROTATE_STEP);
          else if (e.key === "ArrowRight") rotate(ROTATE_STEP);
          else if (e.key === "Enter" || e.key === " ") setInspect((v) => !v);
          else if (e.key === "Escape") setInspect(false);
          else return;
          e.preventDefault();
        }}
      >
        {mode === "3d" ? (
          <SceneBoundary fallback={(error) => fallback2d(`3D view failed to load (${error}). Showing the table view.`)}>
            <Suspense fallback={<div className="scene__loading" role="status">Loading the cabin table…</div>}>
              <MissionTable
                categories={categories}
                featured={featured}
                compare={compare && compare.length === 2 ? [compare[0], compare[1]] : null}
                shoppers={shoppers}
                activeCategory={state.activeCategory}
                yawRef={yawRef}
                inspect={inspect}
                reducedMotion={reducedMotion}
                onSelectCategory={(id) => actions.showCategory(id)}
                onSelectProduct={(id) => {
                  actions.selectProduct(id);
                  actions.setPanel("cart");
                }}
              />
            </Suspense>
          </SceneBoundary>
        ) : (
          fallback2d(webglAvailable() ? undefined : "3D isn’t available on this device. Showing the table view.")
        )}
      </div>
      <div className="scene__controls" role="toolbar" aria-label="Table view controls">
        <button type="button" className="btn btn--small" onClick={() => rotate(-ROTATE_STEP)} aria-label="Rotate product left">⟲ Rotate</button>
        <button type="button" className="btn btn--small" onClick={() => rotate(ROTATE_STEP)} aria-label="Rotate product right">Rotate ⟳</button>
        <button type="button" className="btn btn--small" aria-pressed={inspect} onClick={() => setInspect((v) => !v)}>
          {inspect ? "Exit inspect" : "Inspect"}
        </button>
        <button type="button" className="btn btn--small" onClick={() => { yawRef.current = 0; setYawLabel(0); setInspect(false); }}>Reset view</button>
        <button type="button" className="btn btn--small btn--ghost" onClick={() => setMode((m) => (m === "3d" ? "2d" : "3d"))} disabled={!webglAvailable()}>
          {mode === "3d" ? "Table view (2D)" : "3D view"}
        </button>
        <span className="caption" aria-live="polite">
          {mode === "3d" ? `Drag to orbit · ${yawLabel}° · ${leap === "open" ? "Leap: move hand to rotate, pinch to inspect" : "Leap not connected"}` : ""}
        </span>
      </div>
    </section>
  );
}

/** 2D fallback with the same layout zones: seats in the corners, categories around the cart. */
function TableView2D({ state, actions, categories, shoppers, featured, reason }: {
  state: AppState;
  actions: Controller;
  categories: { id: string; label: string; total: number }[];
  shoppers: SceneShopper[];
  featured: Product | null;
  reason?: string;
}) {
  return (
    <div className="table2d" data-testid="table-2d">
      {reason && <p className="table2d__reason" role="status">{reason}</p>}
      <div className="table2d__grid">
        {shoppers.slice(0, 4).map((s, i) => (
          <div key={s.id} className={`table2d__seat table2d__seat--${i}`}>
            <span className="table2d__dot" style={{ background: s.color }} aria-hidden="true" />
            <strong>{s.name}</strong>
            {s.reaction && <span className="caption">{s.reaction}</span>}
          </div>
        ))}
        <div className="table2d__cart">
          <p className="eyebrow">Shared cart</p>
          <ul>
            {categories.map((c) => (
              <li key={c.id}>
                <button type="button" className={`cat${state.activeCategory === c.id ? " is-active" : ""}`} onClick={() => actions.showCategory(c.id)}>
                  {c.label} ${c.total}
                </button>
              </li>
            ))}
          </ul>
          {featured && (
            <button type="button" className="link" onClick={() => { actions.selectProduct(featured.id); actions.setPanel("cart"); }}>
              Inspect {featured.name}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
