// Pure class-name mapping for the Plaza controls, kept out of the React files so the variants and
// the Leap/keyboard parity rules can be unit-tested without a DOM.

export type PlazaButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type PlazaButtonSize = "md" | "lg";
export type PlazaPanelTone = "default" | "celebrate" | "warning";
export type RailSide = "left" | "right";

type ClassMap = Record<string, string>;

export function joinClasses(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}

export function plazaButtonClassName(
  styles: ClassMap,
  { variant = "secondary", size = "md", className }: { variant?: PlazaButtonVariant; size?: PlazaButtonSize; className?: string },
): string {
  return joinClasses(styles.button, styles[variant], size === "lg" && styles.lg, className);
}

export function railButtonClassName(
  styles: ClassMap,
  { active = false, dim = false, className }: { active?: boolean; dim?: boolean; className?: string },
): string {
  return joinClasses(styles.button, active && styles.active, dim && !active && styles.dim, className);
}

export function plazaPanelClassName(
  styles: ClassMap,
  { tone = "default", className }: { tone?: PlazaPanelTone; className?: string },
): string {
  return joinClasses(styles.panel, tone !== "default" && styles[tone], className);
}
