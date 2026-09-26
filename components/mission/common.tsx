"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { Product } from "@/lib/mission/services/contracts";

export function ConfirmDialog({
  title,
  children,
  actions,
  onCancel,
  tone = "neutral",
}: {
  title: string;
  children: ReactNode;
  actions: { label: string; onClick: () => void; variant?: "primary" | "danger" | "secondary" }[];
  onCancel: () => void;
  tone?: "neutral" | "warning" | "danger";
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    return () => previous?.focus?.();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const focusable = [...ref.current.querySelectorAll<HTMLElement>("button, input, [tabindex='0']")];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="dialog-backdrop">
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby={titleId} className={`dialog dialog--${tone}`} onKeyDown={onKeyDown}>
        <h2 id={titleId}>{title}</h2>
        <div className="dialog__body">{children}</div>
        <div className="dialog__actions">
          {actions.map((a) => (
            <button key={a.label} type="button" className={`btn btn--${a.variant ?? "secondary"}`} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Toast({ message, actionLabel, onAction, onDismiss, timeoutMs = 8000 }: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  timeoutMs?: number;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, timeoutMs);
    return () => clearTimeout(timer);
  }, [message, onDismiss, timeoutMs]);
  return (
    <div className="toast" role="status">
      <span>{message}</span>
      {actionLabel && onAction && (
        <button type="button" className="btn btn--small btn--primary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
      <button type="button" className="btn btn--small btn--ghost" aria-label="Dismiss" onClick={onDismiss}>
        ✕
      </button>
    </div>
  );
}

const AVATAR_COLORS: Record<string, string> = {
  avatar_01: "#3f6b52",
  avatar_02: "#d9913b",
  avatar_03: "#5b7fb0",
  avatar_04: "#9a5b8f",
  avatar_05: "#c0573e",
  avatar_06: "#4d8f8c",
};

export const AVATAR_IDS = Object.keys(AVATAR_COLORS);

export function Avatar({ avatarId, name, size = 40 }: { avatarId?: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const color = AVATAR_COLORS[avatarId ?? ""] ?? "#6b7280";
  // Engine shoppers use ids like "maya" that have no drawing; show their initial instead of a 404.
  if (!avatarId || !(avatarId in AVATAR_COLORS) || failed) {
    return (
      <span className="avatar avatar--initial" style={{ width: size, height: size, background: color }} aria-hidden="true">
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      className="avatar"
      src={`/demo-assets/avatars/${avatarId}.svg`}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
    />
  );
}

export function ProductImage({ product, size = 140 }: { product: Product; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="product-image product-image--missing" style={{ width: size, height: size }} aria-hidden="true">
        {product.name.charAt(0)}
      </div>
    );
  }
  return <img className="product-image" src={product.imageUrl} alt="" width={size} height={size} onError={() => setFailed(true)} />;
}

export function Busy({ label }: { label: string | null }) {
  return (
    <div className="busy" role="status" aria-live="polite">
      {label ? (
        <>
          <span className="spinner" aria-hidden="true" /> {label}…
        </>
      ) : null}
    </div>
  );
}

export function ErrorBanner({ message, onDismiss, onRetry }: { message: string; onDismiss: () => void; onRetry?: () => void }) {
  return (
    <div className="banner banner--error" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn--small" onClick={onRetry}>
          Retry
        </button>
      )}
      <button type="button" className="btn btn--small btn--ghost" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

/** Heading that takes focus when a screen mounts, so keyboard and screen-reader users land on it. */
export function ScreenHeading({ children, level = 1 }: { children: ReactNode; level?: 1 | 2 }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const Tag = level === 1 ? "h1" : "h2";
  return (
    <Tag ref={ref} tabIndex={-1} className="screen-heading">
      {children}
    </Tag>
  );
}
