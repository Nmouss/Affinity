import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PART_OPTIONS, type PartKind } from "@/types/character";
import { PartIcon, partLabel } from "@/components/maker/partIcons";

const kinds = Object.keys(PART_OPTIONS) as PartKind[];

describe("PartIcon", () => {
  for (const kind of kinds) {
    for (const option of PART_OPTIONS[kind]) {
      it(`renders an svg with a label for ${kind}/${option}`, () => {
        const element = PartIcon({ kind, option, size: 32 });
        const markup = renderToStaticMarkup(element);
        expect(markup).toContain("<svg");
        expect(markup.length).toBeGreaterThan(0);

        const label = partLabel(kind, option);
        expect(label.length).toBeGreaterThan(0);
        expect(markup).toContain(label);
      });
    }
  }

  it("uses currentColor when no color is given", () => {
    const markup = renderToStaticMarkup(PartIcon({ kind: "eyes", option: "dot" }));
    expect(markup).toContain("currentColor");
  });

  it("tints the part with the given color", () => {
    const markup = renderToStaticMarkup(PartIcon({ kind: "accessory", option: "scarf", color: "#ff0000" }));
    expect(markup).toContain("#ff0000");
  });

  it("sizes the svg from the size prop", () => {
    const markup = renderToStaticMarkup(PartIcon({ kind: "mouth", option: "smile", size: 64 }));
    expect(markup).toContain('width="64"');
    expect(markup).toContain('height="64"');
  });
});

describe("partLabel", () => {
  it("gives every option in PART_OPTIONS a non-empty, distinct-per-kind label", () => {
    for (const kind of kinds) {
      const labels = PART_OPTIONS[kind].map((option) => partLabel(kind, option));
      for (const label of labels) expect(label.length).toBeGreaterThan(0);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});
