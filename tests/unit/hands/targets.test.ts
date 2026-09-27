import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { handItem, handTarget } from "@/components/hands/makerHitTest";

// Council-UI hand targets: every clickable control the Leap "Wii Remote" pointer can hit-test must
// carry a `data-hand-target` (MakerHands.tsx only pinch-clicks elements that have one). Rendering
// these components in vitest's node environment hits the classic-JSX-runtime problem (no React DOM
// here), so instead we statically scan each owned file's source text for `<button` opening tags and
// assert every one spreads `handTarget(...)` or writes `data-hand-target` directly, matching the
// convention used by already-tagged files like PlazaRails.tsx and OptionGrid.tsx.

const OWNED_FILES = [
  "../../../components/plan/PlanPreview.tsx",
  "../../../components/maker/plaza/RecipientPicker.tsx",
  "../../../components/stage/EmbeddedCouncil.tsx",
  "../../../components/council/MissionForm.tsx",
  "../../../components/maker/plaza/MissionCircle.tsx",
  "../../../components/bundle/BundlePreview.tsx",
  "../../../components/hud/InviteChips.tsx",
  "../../../components/sprites/ProfileCard.tsx",
];

function readOwned(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

/** Pulls out each `<button ...>` opening tag (not the closing `</button>`), tracking `{}` depth so
 * a `>` inside a JS expression (e.g. an arrow function's `=>`) never fools the tag boundary. */
function extractButtonOpenTags(source: string): string[] {
  const tags: string[] = [];
  const startPattern = /<button\b/g;
  let match: RegExpExecArray | null;
  while ((match = startPattern.exec(source))) {
    const start = match.index;
    let depth = 0;
    let end = source.length;
    for (let i = start; i < source.length; i++) {
      const ch = source[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) {
        end = i + 1;
        break;
      }
    }
    tags.push(source.slice(start, end));
  }
  return tags;
}

describe("council UI hand targets", () => {
  for (const relativePath of OWNED_FILES) {
    it(`every <button> in ${relativePath.replace("../../../", "")} has a data-hand-target`, () => {
      const source = readOwned(relativePath);
      const buttons = extractButtonOpenTags(source);
      for (const tag of buttons) {
        const tagged = tag.includes("handTarget(") || tag.includes("data-hand-target");
        expect(tagged, `expected a data-hand-target on: ${tag}`).toBe(true);
      }
    });
  }

  it("PlanPreview and BundlePreview mark their item cards with handItem", () => {
    const planSource = readOwned("../../../components/plan/PlanPreview.tsx");
    const bundleSource = readOwned("../../../components/bundle/BundlePreview.tsx");
    expect(planSource).toContain("handItem(stop.id)");
    expect(bundleSource).toContain("handItem(item.id)");
  });
});

describe("makerHitTest helpers", () => {
  it("handTarget spreads a single data-hand-target attribute", () => {
    expect(handTarget("council-stop")).toEqual({ "data-hand-target": "council-stop" });
  });

  it("handItem spreads a single data-hand-item attribute", () => {
    expect(handItem("stop-1")).toEqual({ "data-hand-item": "stop-1" });
  });
});
