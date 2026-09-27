import { describe, expect, it } from "vitest";
import { classifyEnvironment } from "@/lib/director/environmentClassifier";

describe("classifyEnvironment", () => {
  it("falls back to neutral when nothing matches", () => {
    expect(classifyEnvironment("Find a good pair of running shoes")).toBe("neutral");
    expect(classifyEnvironment("")).toBe("neutral");
  });

  it("classifies a winter/holiday mission", () => {
    expect(classifyEnvironment("Christmas tree under $200")).toBe("winter");
    expect(classifyEnvironment("Hanukkah gifts for the kids")).toBe("winter");
  });

  it("classifies an outdoor market mission", () => {
    expect(classifyEnvironment("Find a stall at the weekend market")).toBe("plaza");
  });

  it("classifies a mall/shopping mission", () => {
    expect(classifyEnvironment("New sneakers from the mall")).toBe("mall");
    expect(classifyEnvironment("A store downtown with a shopping center nearby")).toBe("mall");
  });

  it("classifies a restaurant/dinner mission", () => {
    expect(classifyEnvironment("Book a dinner reservation for our anniversary")).toBe("restaurant");
  });

  it("classifies a sports/game mission", () => {
    expect(classifyEnvironment("Tickets to the game this weekend")).toBe("stadium");
    expect(classifyEnvironment("Tailgate supplies for Sunday")).toBe("stadium");
  });
});
