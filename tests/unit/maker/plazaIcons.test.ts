import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BackIcon,
  EditIcon,
  GrabbingHandGlyph,
  GRABBING_CURSOR_CSS,
  HelpIcon,
  MoveIcon,
  NewIcon,
  PointerHandGlyph,
  POINTER_CURSOR_CSS,
  RemoveIcon,
  SortCircleIcon,
  SortNameIcon,
  WhistleIcon,
} from "@/components/maker/plaza/plazaIcons";

const RAIL_ICONS = { BackIcon, EditIcon, NewIcon, RemoveIcon, HelpIcon, MoveIcon, WhistleIcon, SortNameIcon, SortCircleIcon };

describe("plaza rail icons", () => {
  for (const [name, Icon] of Object.entries(RAIL_ICONS)) {
    it(`${name} renders an svg`, () => {
      const markup = renderToStaticMarkup(Icon({}));
      expect(markup).toContain("<svg");
      expect(markup.length).toBeGreaterThan(0);
    });
  }

  it("sizes an icon from the size prop", () => {
    const markup = renderToStaticMarkup(WhistleIcon({ size: 64 }));
    expect(markup).toContain('width="64"');
    expect(markup).toContain('height="64"');
  });
});

describe("cursor glyphs", () => {
  it("PointerHandGlyph and GrabbingHandGlyph render distinct svgs", () => {
    const pointer = renderToStaticMarkup(PointerHandGlyph({}));
    const grabbing = renderToStaticMarkup(GrabbingHandGlyph({}));
    expect(pointer).toContain("<svg");
    expect(grabbing).toContain("<svg");
    expect(pointer).not.toBe(grabbing);
    // The badge is only on the pointing-hand cursor, not the fist.
    expect(pointer).toContain(">1<");
    expect(grabbing).not.toContain(">1<");
  });

  it("the CSS cursor values are usable data-uri `cursor` property values with a hotspot", () => {
    for (const css of [POINTER_CURSOR_CSS, GRABBING_CURSOR_CSS]) {
      expect(css).toMatch(/^url\("data:image\/svg\+xml,.+"\) \d+ \d+, (pointer|grabbing)$/);
    }
    expect(POINTER_CURSOR_CSS).not.toBe(GRABBING_CURSOR_CSS);
  });
});
