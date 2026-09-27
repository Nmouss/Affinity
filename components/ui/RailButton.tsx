"use client";

import { forwardRef, useId, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { playBlip } from "@/components/maker/sound";
import { joinClasses, railButtonClassName, type RailSide } from "./classes";
import styles from "./RailButton.module.css";

export interface RailButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Spoken/visible name: the tooltip text and the accessible label. */
  label: string;
  icon: ReactNode;
  active?: boolean;
  dim?: boolean;
  /** Which edge the rail hugs; the tooltip opens toward the center. */
  side?: RailSide;
  silent?: boolean;
  "data-hand-target"?: string;
}

/** Circular icon control matching the Plaza rails, with the label as a hover/focus tooltip. */
export const RailButton = forwardRef<HTMLButtonElement, RailButtonProps>(function RailButton(
  { label, icon, active, dim, side = "left", silent = false, className, onClick, type = "button", ...rest },
  ref,
) {
  const tooltipId = useId();
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!silent && !rest.disabled) playBlip("select");
    onClick?.(event);
  };
  return (
    <span className={joinClasses(styles.wrap, side === "right" && styles.right)}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        aria-describedby={tooltipId}
        aria-pressed={active}
        className={railButtonClassName(styles, { active, dim, className })}
        onClick={handleClick}
        {...rest}
      >
        {icon}
      </button>
      <span id={tooltipId} role="tooltip" className={styles.tooltip}>
        {label}
      </span>
    </span>
  );
});
