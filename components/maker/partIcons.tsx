import type { PartKind } from "@/types/character";

// SVG thumbnails for every People Maker part option. Stub until the look track draws them.

export interface PartIconProps {
  kind: PartKind;
  /** One of PART_OPTIONS[kind]. */
  option: string;
  /** Tint for the part (eye color, accessory color); a neutral ink when omitted. */
  color?: string;
  /** Rendered width and height in px. */
  size?: number;
}

export function PartIcon({ option, size = 48 }: PartIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={option}>
      <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="2" />
      <text x="24" y="28" textAnchor="middle" fontSize="10" fill="currentColor">
        {option.slice(0, 5)}
      </text>
    </svg>
  );
}
