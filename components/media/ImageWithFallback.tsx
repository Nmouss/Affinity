"use client";

import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from "react";

interface ImageWithFallbackProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  fallback: ReactNode;
}

/** Render a designed fallback whenever a remote or proxied image is absent or fails to load. */
export function ImageWithFallback({ src, fallback, onError, ...props }: ImageWithFallbackProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (failed) return <>{fallback}</>;

  return (
    <img
      {...props}
      src={src}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}
