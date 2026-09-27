import { forwardRef, useId, type HTMLAttributes, type ReactNode } from "react";
import { plazaPanelClassName, type PlazaPanelTone } from "./classes";
import styles from "./PlazaPanel.module.css";

// The native `title` tooltip attribute is replaced by a rendered heading.
export interface PlazaPanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  tone?: PlazaPanelTone;
  /** Element to render as; `section` by default, `aside` for side panels. */
  as?: "section" | "aside" | "div";
}

/** Rounded ivory panel in the Plaza's language; the title (when given) labels the region. */
export const PlazaPanel = forwardRef<HTMLElement, PlazaPanelProps>(function PlazaPanel(
  { title, tone, as: Tag = "section", className, children, ...rest },
  ref,
) {
  const titleId = useId();
  const labelled = title !== undefined && title !== null && rest["aria-label"] === undefined && rest["aria-labelledby"] === undefined;
  return (
    <Tag
      // forwardRef's HTMLElement ref is fine for any of the three tags.
      ref={ref as never}
      className={plazaPanelClassName(styles, { tone, className })}
      aria-labelledby={labelled ? titleId : rest["aria-labelledby"]}
      {...rest}
    >
      {title !== undefined && title !== null && (
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
      )}
      {children}
    </Tag>
  );
});
