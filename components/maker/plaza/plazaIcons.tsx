// eslint-disable-next-line @typescript-eslint/no-unused-vars -- classic JSX runtime needs React in scope
import React from "react";

// Wii U Mii Maker plaza icon glyphs: chunky rounded-stroke line art in a single mid-gray ink, meant
// to sit on the light-filled round buttons PlazaRails draws (the button itself owns the circle,
// the thick outline, and the fill — these components draw only the glyph). Plain function
// components with no hooks, like partIcons.tsx, so they render fine in a static-markup test.

export const PLAZA_ICON_STROKE = "#5c574c";
const SW = 2.4;

interface IconProps {
  /** Rendered width and height in px. */
  size?: number;
}

function Glyph({ size = 40, children }: { size?: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke={PLAZA_ICON_STROKE}
      strokeWidth={SW}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** The face-with-speech-bubble shape shared by Edit (an eye) and New (a plus). */
function FaceWithBubble({ bubble }: { bubble: React.ReactNode }) {
  return (
    <>
      <circle cx={19} cy={27} r={13.5} />
      <circle cx={14.5} cy={25} r={1.7} fill={PLAZA_ICON_STROKE} stroke="none" />
      <circle cx={23.5} cy={25} r={1.7} fill={PLAZA_ICON_STROKE} stroke="none" />
      <path d="M13 31.5 Q19 37 25 31.5" />
      <path d="M31 6 h11 a4.2 4.2 0 0 1 4.2 4.2 v6.4 a4.2 4.2 0 0 1 -4.2 4.2 h-2.4 l-3.4 4 v-4 h-5.2 a4.2 4.2 0 0 1 -4.2 -4.2 v-6.4 a4.2 4.2 0 0 1 4.2 -4.2 z" />
      {bubble}
    </>
  );
}

export function BackIcon({ size }: IconProps) {
  return (
    <Glyph size={size}>
      <path d="M30 9 L16 24 L30 39" />
    </Glyph>
  );
}

/** View/edit: a face with an eye in its speech bubble. */
export function EditIcon({ size }: IconProps) {
  return (
    <Glyph size={size}>
      <FaceWithBubble
        bubble={
          <>
            <ellipse cx={36.5} cy={13.2} rx={4.4} ry={2.8} />
            <circle cx={36.5} cy={13.2} r={1.2} fill={PLAZA_ICON_STROKE} stroke="none" />
          </>
        }
      />
    </Glyph>
  );
}

/** New person: a face with a plus in its speech bubble. */
/** Interview: a face with sound waves in its speech bubble. */
export function InterviewIcon({ size }: IconProps) {
  return (
    <Glyph size={size}>
      <FaceWithBubble
        bubble={
          <>
            <path d="M32.5 11.5v3.5" />
            <path d="M36.5 9.5v7.5" />
            <path d="M40.5 11v4.5" />
          </>
        }
      />
    </Glyph>
  );
}

export function NewIcon({ size }: IconProps) {
  return (
    <Glyph size={size}>
      <FaceWithBubble
        bubble={
          <>
            <line x1={36.5} y1={9.4} x2={36.5} y2={17} />
            <line x1={32.7} y1={13.2} x2={40.3} y2={13.2} />
          </>
        }
      />
    </Glyph>
  );
}

export function RemoveIcon({ size }: IconProps) {
  return (
    <Glyph size={size}>
      <line x1={13} y1={14} x2={35} y2={14} />
      <path d="M18 14 V10.2 a3 3 0 0 1 3 -3 h6 a3 3 0 0 1 3 3 V14" />
      <path d="M16.5 14 L18.6 38.2 a3 3 0 0 0 3 2.8 h4.8 a3 3 0 0 0 3 -2.8 L31.5 14" />
      <line x1={21} y1={20} x2={21} y2={33} />
      <line x1={27} y1={20} x2={27} y2={33} />
    </Glyph>
  );
}

export function HelpIcon({ size }: IconProps) {
  return (
    <Glyph size={size}>
      <circle cx={24} cy={24} r={17} />
      <path d="M18.5 18.5 a5.6 5.6 0 1 1 8 5 c-1.7 1 -2.5 2.1 -2.5 4.1" />
      <circle cx={24} cy={33.6} r={1.9} fill={PLAZA_ICON_STROKE} stroke="none" />
    </Glyph>
  );
}

/** Move to Family/Friends: a little group of two people. */
export function MoveIcon({ size }: IconProps) {
  return (
    <Glyph size={size}>
      <circle cx={17} cy={16} r={5.2} />
      <path d="M7.5 35 q0 -11.5 9.5 -11.5 q9.5 0 9.5 11.5" />
      <circle cx={32} cy={19} r={4.4} />
      <path d="M24 35 q0 -9.6 8 -9.6 q8 0 8 9.6" />
    </Glyph>
  );
}

/** Mission action: a wrapped gift, matching the plaza's friendly outlined icon language. */
export function ShopTogetherIcon({ size = 40 }: IconProps) {
  return (
    <Glyph size={size}>
      <rect x={8} y={18} width={32} height={23} rx={3} />
      <path d="M6 18 h36 v-7 H6 z" />
      <path d="M24 11 v30" />
      <path d="M24 11 C19 2 10 4 12 10 c1 3 6 3 12 1" />
      <path d="M24 11 C29 2 38 4 36 10 c-1 3-6 3-12 1" />
    </Glyph>
  );
}

/** Mission action: a dinner plate with fork and knife. */
export function DinnerPlanIcon({ size = 40 }: IconProps) {
  return (
    <Glyph size={size}>
      <circle cx={24} cy={25} r={11} />
      <circle cx={24} cy={25} r={6} />
      <path d="M8 7 v12 M4.5 7 v7 c0 3 7 3 7 0 V7 M8 19 v22" />
      <path d="M39 7 v34 M34 7 v11 c0 3 5 3 5 0" />
    </Glyph>
  );
}

export function WhistleIcon({ size }: IconProps) {
  return (
    <Glyph size={size}>
      <circle cx={17} cy={26} r={10.5} />
      <circle cx={17} cy={26} r={3} fill={PLAZA_ICON_STROKE} stroke="none" />
      <path d="M26 20.5 h9.5 a4.7 4.7 0 0 1 0 9.4 h-9.5" />
      <path d="M12.5 16.3 L8.5 10.5" />
    </Glyph>
  );
}

/** Whistle sort option: alphabetical. */
export function SortNameIcon({ size }: IconProps) {
  return (
    <Glyph size={size}>
      <text x={9} y={31} fontSize={17} fontWeight={700} fill={PLAZA_ICON_STROKE} stroke="none" fontFamily="inherit">
        A
      </text>
      <path d="M21 24 h9" />
      <path d="M27 20 l4 4 l-4 4" />
      <text x={34} y={31} fontSize={17} fontWeight={700} fill={PLAZA_ICON_STROKE} stroke="none" fontFamily="inherit">
        Z
      </text>
    </Glyph>
  );
}

/** Whistle sort option: split by circle (family vs. friends). */
export function SortCircleIcon({ size }: IconProps) {
  return (
    <Glyph size={size}>
      <circle cx={11} cy={16} r={3} fill={PLAZA_ICON_STROKE} stroke="none" />
      <circle cx={17.5} cy={20.5} r={3} fill={PLAZA_ICON_STROKE} stroke="none" />
      <circle cx={11} cy={27} r={3} fill={PLAZA_ICON_STROKE} stroke="none" />
      <line x1={24} y1={8} x2={24} y2={40} strokeDasharray="4 4" />
      <circle cx={30.5} cy={20.5} r={3} fill={PLAZA_ICON_STROKE} stroke="none" />
      <circle cx={37} cy={16} r={3} fill={PLAZA_ICON_STROKE} stroke="none" />
      <circle cx={37} cy={27} r={3} fill={PLAZA_ICON_STROKE} stroke="none" />
    </Glyph>
  );
}

// --- Cursor glyphs -----------------------------------------------------------------------------
// A white pointing-hand with a small blue "1" badge (Wii-remote-cursor style), and a fist for the
// grabbing state. Rendered twice: once as plain JSX (the Leap DOM cursor in MakerHands) and once as
// a data-URI string (the CSS `cursor` property on the plaza while a mouse drives it) — the two are
// kept visually in sync by hand since a CSS value can't reuse JSX.

const HAND_PATH =
  "M12 3a2.2 2.2 0 0 1 4.4 0v8.5h1V5.5a2.2 2.2 0 0 1 4.4 0V13h1V7.5a2.2 2.2 0 0 1 4.4 0v9.9c0 1.1-.2 2.2-.7 3.2l-2.2 4.6c-.9 1.9-2.8 3.1-4.9 3.1h-3.6c-1.5 0-2.9-.7-3.8-1.9l-5.1-6.8a2 2 0 0 1 2.9-2.7l2.3 2V3z";

export function PointerHandGlyph({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d={HAND_PATH} fill="#ffffff" stroke="#2b2b2b" strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx={25} cy={25} r={6} fill="#2f6fed" stroke="#1c3f99" strokeWidth={1.2} />
      <text x={25} y={28} fontSize={8} fontWeight={700} fill="#ffffff" textAnchor="middle">
        1
      </text>
    </svg>
  );
}

export function GrabbingHandGlyph({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect x={8} y={12} width={16} height={14} rx={6} fill="#ffffff" stroke="#2b2b2b" strokeWidth={1.6} />
      <path d="M10 12v-3a2 2 0 0 1 4 0v3" fill="#ffffff" stroke="#2b2b2b" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M14 12v-4a2 2 0 0 1 4 0v4" fill="#ffffff" stroke="#2b2b2b" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M18 12v-3a2 2 0 0 1 4 0v3" fill="#ffffff" stroke="#2b2b2b" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

function cursorMarkup(inner: string): string {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>${inner}</svg>`;
}

const POINTER_CURSOR_MARKUP = cursorMarkup(
  `<path d='${HAND_PATH}' fill='#ffffff' stroke='#2b2b2b' stroke-width='1.6' stroke-linejoin='round'/>` +
    `<circle cx='25' cy='25' r='6' fill='#2f6fed' stroke='#1c3f99' stroke-width='1.2'/>` +
    `<text x='25' y='28' font-size='8' font-weight='700' fill='#ffffff' text-anchor='middle' font-family='sans-serif'>1</text>`,
);

const GRABBING_CURSOR_MARKUP = cursorMarkup(
  `<rect x='8' y='12' width='16' height='14' rx='6' fill='#ffffff' stroke='#2b2b2b' stroke-width='1.6'/>` +
    `<path d='M10 12v-3a2 2 0 0 1 4 0v3' fill='#ffffff' stroke='#2b2b2b' stroke-width='1.6' stroke-linejoin='round'/>` +
    `<path d='M14 12v-4a2 2 0 0 1 4 0v4' fill='#ffffff' stroke='#2b2b2b' stroke-width='1.6' stroke-linejoin='round'/>` +
    `<path d='M18 12v-3a2 2 0 0 1 4 0v3' fill='#ffffff' stroke='#2b2b2b' stroke-width='1.6' stroke-linejoin='round'/>`,
);

function cssCursorUrl(markup: string, hotspot: readonly [number, number], fallback: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(markup)}") ${hotspot[0]} ${hotspot[1]}, ${fallback}`;
}

/** `cursor` property value for the plaza's default (pointing-hand) mouse cursor. */
export const POINTER_CURSOR_CSS = cssCursorUrl(POINTER_CURSOR_MARKUP, [11, 3], "pointer");

/** `cursor` property value while the mouse is grabbing (dragging) a Mii. */
export const GRABBING_CURSOR_CSS = cssCursorUrl(GRABBING_CURSOR_MARKUP, [16, 19], "grabbing");
