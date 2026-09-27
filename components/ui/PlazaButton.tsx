"use client";

import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { playBlip } from "@/components/maker/sound";
import { plazaButtonClassName, type PlazaButtonSize, type PlazaButtonVariant } from "./classes";
import styles from "./PlazaButton.module.css";

export interface PlazaButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PlazaButtonVariant;
  size?: PlazaButtonSize;
  /** Skip the short select blip on click (for controls that play their own sound). */
  silent?: boolean;
  /** Leap hand target id; the hand layer sets data-hand-hover on the matching element. */
  "data-hand-target"?: string;
}

/**
 * The Plaza's rounded control for use outside the People Maker. Mouse hover, keyboard focus and
 * Leap hover ([data-hand-hover]) share the same lift/glow; press compresses; click blips.
 */
export const PlazaButton = forwardRef<HTMLButtonElement, PlazaButtonProps>(function PlazaButton(
  { variant, size, silent = false, className, onClick, type = "button", children, ...rest },
  ref,
) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!silent && !rest.disabled) playBlip("select");
    onClick?.(event);
  };
  return (
    <button ref={ref} type={type} className={plazaButtonClassName(styles, { variant, size, className })} onClick={handleClick} {...rest}>
      {children}
    </button>
  );
});
