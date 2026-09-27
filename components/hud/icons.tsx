import type { SVGProps } from "react";

// Small stroke icons in the Plaza's line style, so no control depends on emoji or symbol fonts.
// They inherit `currentColor`; size with the `size` prop (px) or CSS.

type IconProps = { size?: number; strokeWidth?: number } & Omit<SVGProps<SVGSVGElement>, "width" | "height">;

function Glyph({ size = 20, strokeWidth = 2.2, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M5 12.5l4.2 4.2L19 7.5" />
    </Glyph>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4.2h-4.2" />
    </Glyph>
  );
}

export function CrossIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Glyph>
  );
}

export function StarIcon({ filled = true, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Glyph {...props} fill={filled ? "currentColor" : "none"} strokeWidth={filled ? 1.2 : props.strokeWidth}>
      <path d="M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 17l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z" />
    </Glyph>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <Glyph {...props} fill="currentColor" strokeWidth={1}>
      <path d="M12 2.5c.6 4.6 2.9 6.9 7.5 7.5-4.6.6-6.9 2.9-7.5 7.5-.6-4.6-2.9-6.9-7.5-7.5 4.6-.6 6.9-2.9 7.5-7.5z" />
    </Glyph>
  );
}

export function FastForwardIcon(props: IconProps) {
  return (
    <Glyph {...props} fill="currentColor" strokeWidth={1.4}>
      <path d="M4 6.5v11l7-5.5zM12.5 6.5v11l7-5.5z" />
    </Glyph>
  );
}

export function SkipForwardIcon(props: IconProps) {
  return (
    <Glyph {...props} fill="currentColor" strokeWidth={1.4}>
      <path d="M5 6.5v11l8.5-5.5z" />
      <path d="M17.5 6v12" fill="none" strokeWidth={2.4} />
    </Glyph>
  );
}

export function DiceIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

export function GiftIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="3.5" y="9" width="17" height="11.5" rx="2" />
      <path d="M3.5 13h17M12 9v11.5" />
      <path d="M12 9c-1.5-3.5-5.5-4.5-6-2 .3 1.8 3 2.3 6 2zM12 9c1.5-3.5 5.5-4.5 6-2-.3 1.8-3 2.3-6 2z" />
    </Glyph>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </Glyph>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M10 14a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.2 1.2" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.2-1.2" />
    </Glyph>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M6 11.5a6 6 0 0 0 12 0M12 17.5v3M9 20.5h6" />
    </Glyph>
  );
}

export function SpeakerIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 9.5v5h3.5l4.5 3.5V6L7.5 9.5z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </Glyph>
  );
}

export function KeyboardIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2.5" />
      <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
    </Glyph>
  );
}
