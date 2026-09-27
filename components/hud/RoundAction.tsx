"use client";

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./RoundAction.module.css";

type Tone = "neutral" | "approve" | "swap" | "cancel";

interface BaseProps {
  icon: ReactNode;
  label: string;
  tone?: Tone;
  /** Hand-hover target id, as the plaza rails use. */
  target?: string;
  plaza?: boolean;
  size?: "md" | "sm";
}

type ButtonProps = BaseProps & { href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;
type LinkProps = BaseProps & { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href">;

function classes({ tone = "neutral", plaza, size }: BaseProps): string {
  return [styles.round, tone !== "neutral" ? styles[tone] : "", plaza ? styles.plaza : "", size === "sm" ? styles.small : ""].filter(Boolean).join(" ");
}

/** A round icon action with its label beneath; a button, or a link when `href` is given. */
export function RoundAction(props: ButtonProps | LinkProps) {
  const { icon, label, tone, target, plaza, size, ...rest } = props;
  const className = classes({ icon, label, tone, plaza, size });
  const body = (
    <>
      <span className={styles.icon} aria-hidden>
        {icon}
      </span>
      <span className={styles.label}>{label}</span>
    </>
  );
  if ("href" in rest && typeof rest.href === "string") {
    const { href, ...anchor } = rest as LinkProps;
    return (
      <a className={className} href={href} target="_blank" rel="noreferrer" data-hand-target={target} {...anchor}>
        {body}
      </a>
    );
  }
  const button = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type="button" className={className} data-hand-target={target} {...button}>
      {body}
    </button>
  );
}
