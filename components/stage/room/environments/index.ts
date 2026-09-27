import type { ComponentType } from "react";
import { MallPreset } from "./MallPreset";
import { NeutralPreset } from "./NeutralPreset";
import { PlazaPreset } from "./PlazaPreset";
import { RestaurantPreset } from "./RestaurantPreset";
import { StadiumPreset } from "./StadiumPreset";
import type { EnvironmentPreset } from "./types";
import { WinterPreset } from "./WinterPreset";

export type { EnvironmentPreset } from "./types";

export const ENVIRONMENTS: Record<EnvironmentPreset, ComponentType> = {
  neutral: NeutralPreset,
  winter: WinterPreset,
  plaza: PlazaPreset,
  mall: MallPreset,
  restaurant: RestaurantPreset,
  stadium: StadiumPreset,
};
