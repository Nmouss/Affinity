// eslint-disable-next-line @typescript-eslint/no-unused-vars -- classic JSX runtime needs React in scope
import React from "react";
import type { AccessoryType, BrowType, EyeType, MouthType, PartKind } from "@/types/character";

// SVG thumbnails for every People Maker part option: a small "face tile" pictogram so the picker
// grids read like Mii part tiles. Each is a plain function component (no hooks), so it can be
// called directly in tests without a DOM.

export interface PartIconProps {
  kind: PartKind;
  /** One of PART_OPTIONS[kind]. */
  option: string;
  /** Tint for the part (eye color, accessory color); a neutral ink when omitted. */
  color?: string;
  /** Rendered width and height in px. */
  size?: number;
}

const LABELS: Record<PartKind, Record<string, string>> = {
  eyes: {
    dot: "Dot eyes",
    oval: "Oval eyes",
    sleepy: "Sleepy eyes",
    sparkle: "Sparkle eyes",
    wide: "Wide eyes",
  },
  brows: {
    none: "No brows",
    soft: "Soft brows",
    bold: "Bold brows",
    raised: "Raised brows",
  },
  mouth: {
    smile: "Smile",
    grin: "Grin",
    o: "O mouth",
    flat: "Flat mouth",
    cat: "Cat mouth",
  },
  accessory: {
    none: "No accessory",
    scarf: "Scarf",
    bow: "Bow",
    dinosaur: "Dinosaur spikes",
    glasses: "Glasses",
    beanie: "Beanie",
    flower: "Flower",
    antenna: "Antenna",
  },
};

/** Human label for a part option, used both for the icon's aria-label and any picker caption. */
export function partLabel(kind: PartKind, option: string): string {
  return LABELS[kind]?.[option] ?? option;
}

const EYE_X = [-7, 7];

function EyesArt({ option, color }: { option: EyeType; color: string }) {
  switch (option) {
    case "dot":
      return (
        <>
          {EYE_X.map((dx) => (
            <circle key={dx} cx={24 + dx} cy={24} r={3.4} fill={color} />
          ))}
        </>
      );
    case "sleepy":
      return (
        <>
          {EYE_X.map((dx) => (
            <g key={dx}>
              <ellipse cx={24 + dx} cy={25} rx={4.4} ry={2.3} fill={color} />
              <path
                d={`M ${24 + dx - 4.4} 21 Q ${24 + dx} 18 ${24 + dx + 4.4} 21`}
                stroke={color}
                strokeWidth={1.6}
                fill="none"
                strokeLinecap="round"
              />
            </g>
          ))}
        </>
      );
    case "sparkle":
      return (
        <>
          {EYE_X.map((dx) => (
            <g key={dx}>
              <circle cx={24 + dx} cy={24} r={5.2} fill={color} />
              <circle cx={24 + dx - 1.6} cy={22} r={1.3} fill="#fff" />
              <circle cx={24 + dx + 1.8} cy={25.6} r={0.8} fill="#fff" />
            </g>
          ))}
        </>
      );
    case "wide":
      return (
        <>
          {EYE_X.map((dx) => (
            <g key={dx}>
              <circle cx={24 + dx} cy={24} r={5.6} fill={color} />
              <circle cx={24 + dx - 1.8} cy={22} r={1.5} fill="#fff" />
            </g>
          ))}
        </>
      );
    case "oval":
    default:
      return (
        <>
          {EYE_X.map((dx) => (
            <g key={dx}>
              <ellipse cx={24 + dx} cy={24} rx={3.6} ry={5.4} fill={color} />
              <circle cx={24 + dx - 1} cy={21.6} r={1.1} fill="#fff" />
            </g>
          ))}
        </>
      );
  }
}

function BrowsArt({ option, color }: { option: BrowType; color: string }) {
  if (option === "none") return null;
  return (
    <>
      {EYE_X.map((dx) => {
        if (option === "bold") {
          return (
            <path
              key={dx}
              d={`M ${24 + dx - 5} 15.5 Q ${24 + dx} 14.5 ${24 + dx + 5} 15.5`}
              stroke={color}
              strokeWidth={4}
              fill="none"
              strokeLinecap="round"
            />
          );
        }
        if (option === "raised") {
          return (
            <path
              key={dx}
              d={`M ${24 + dx - 4.6} 15 Q ${24 + dx} 8.5 ${24 + dx + 4.6} 15`}
              stroke={color}
              strokeWidth={2.4}
              fill="none"
              strokeLinecap="round"
            />
          );
        }
        return (
          <path
            key={dx}
            d={`M ${24 + dx - 4.6} 16 Q ${24 + dx} 14 ${24 + dx + 4.6} 16`}
            stroke={color}
            strokeWidth={2.2}
            fill="none"
            strokeLinecap="round"
          />
        );
      })}
    </>
  );
}

function MouthArt({ option, color }: { option: MouthType; color: string }) {
  switch (option) {
    case "grin":
      return (
        <path
          d="M 14 29 Q 24 40 34 29 Q 24 34.5 14 29 Z"
          fill={color}
        />
      );
    case "o":
      return <circle cx={24} cy={31} r={4} fill="none" stroke={color} strokeWidth={3} />;
    case "flat":
      return <line x1={17} y1={30} x2={31} y2={30} stroke={color} strokeWidth={3} strokeLinecap="round" />;
    case "cat":
      return (
        <>
          <path d="M 18 31 Q 21 27 24 31" stroke={color} strokeWidth={2.6} fill="none" strokeLinecap="round" />
          <path d="M 24 31 Q 27 27 30 31" stroke={color} strokeWidth={2.6} fill="none" strokeLinecap="round" />
        </>
      );
    case "smile":
    default:
      return <path d="M 17 29 Q 24 36 31 29" stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />;
  }
}

function AccessoryArt({ option, color }: { option: AccessoryType; color: string }) {
  switch (option) {
    case "scarf":
      return (
        <>
          <path d="M 10 33 Q 24 40 38 33 L 36 28 Q 24 34 12 28 Z" fill={color} />
          <path d="M 27 33 L 30 42 L 24 38 Z" fill={color} />
        </>
      );
    case "bow":
      return (
        <>
          <polygon points="14,16 23,12 23,20" fill={color} />
          <polygon points="34,16 25,12 25,20" fill={color} />
          <circle cx={24} cy={16} r={2.4} fill={color} />
        </>
      );
    case "dinosaur":
      return (
        <>
          <polygon points="14,15 18,4 22,15" fill={color} />
          <polygon points="20,16 24,5 28,16" fill={color} />
          <polygon points="26,15 30,4 34,15" fill={color} />
        </>
      );
    case "glasses":
      return (
        <>
          <circle cx={17} cy={24} r={6} fill="none" stroke={color} strokeWidth={2.4} />
          <circle cx={31} cy={24} r={6} fill="none" stroke={color} strokeWidth={2.4} />
          <line x1={23} y1={24} x2={25} y2={24} stroke={color} strokeWidth={2.4} />
        </>
      );
    case "beanie":
      return (
        <>
          <path d="M 11 23 Q 24 3 37 23 Z" fill={color} />
          <circle cx={24} cy={5} r={3} fill={color} />
        </>
      );
    case "flower":
      return (
        <>
          {[0, 1, 2, 3, 4].map((index) => (
            <ellipse
              key={index}
              cx={24}
              cy={13}
              rx={3.2}
              ry={6}
              fill={color}
              opacity={0.9}
              transform={`rotate(${index * 72} 24 20)`}
            />
          ))}
          <circle cx={24} cy={20} r={3} fill="#fff" opacity={0.85} />
        </>
      );
    case "antenna":
      return (
        <>
          <line x1={24} y1={26} x2={24} y2={10} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
          <circle cx={24} cy={8} r={3.4} fill={color} />
        </>
      );
    case "none":
    default:
      return null;
  }
}

export function PartIcon({ kind, option, color, size = 48 }: PartIconProps) {
  const tint = color ?? "currentColor";
  const label = partLabel(kind, option);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={label}>
      <circle cx={24} cy={24} r={21} fill="#f2ebdd" stroke="#00000014" />
      {kind === "eyes" && <EyesArt option={option as EyeType} color={tint} />}
      {kind === "brows" && <BrowsArt option={option as BrowType} color={tint} />}
      {kind === "mouth" && <MouthArt option={option as MouthType} color={tint} />}
      {kind === "accessory" && <AccessoryArt option={option as AccessoryType} color={tint} />}
    </svg>
  );
}
