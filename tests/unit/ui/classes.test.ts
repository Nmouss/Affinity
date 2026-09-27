import { describe, expect, it } from "vitest";
import { joinClasses, plazaButtonClassName, plazaPanelClassName, railButtonClassName } from "@/components/ui/classes";

// vitest runs in a node environment with no DOM renderer, so the controls are covered through their
// pure class mapping (the part that decides variant, size, tone and rail state).

const styles = {
  button: "button",
  primary: "primary",
  secondary: "secondary",
  danger: "danger",
  ghost: "ghost",
  lg: "lg",
  active: "active",
  dim: "dim",
  panel: "panel",
  celebrate: "celebrate",
  warning: "warning",
};

describe("joinClasses", () => {
  it("drops falsy entries and keeps order", () => {
    expect(joinClasses("a", false, null, undefined, "b")).toBe("a b");
  });
});

describe("plazaButtonClassName", () => {
  it("defaults to a medium secondary button", () => {
    expect(plazaButtonClassName(styles, {})).toBe("button secondary");
  });

  it("maps every variant and the large size", () => {
    expect(plazaButtonClassName(styles, { variant: "primary", size: "lg" })).toBe("button primary lg");
    expect(plazaButtonClassName(styles, { variant: "danger" })).toBe("button danger");
    expect(plazaButtonClassName(styles, { variant: "ghost", className: "extra" })).toBe("button ghost extra");
  });
});

describe("railButtonClassName", () => {
  it("is plain by default", () => {
    expect(railButtonClassName(styles, {})).toBe("button");
  });

  it("dims only when not active", () => {
    expect(railButtonClassName(styles, { dim: true })).toBe("button dim");
    expect(railButtonClassName(styles, { dim: true, active: true })).toBe("button active");
  });
});

describe("plazaPanelClassName", () => {
  it("adds a tone class only for non-default tones", () => {
    expect(plazaPanelClassName(styles, {})).toBe("panel");
    expect(plazaPanelClassName(styles, { tone: "celebrate" })).toBe("panel celebrate");
    expect(plazaPanelClassName(styles, { tone: "warning", className: "x" })).toBe("panel warning x");
  });
});
