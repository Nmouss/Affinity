"use client";

import { Component, type ReactNode } from "react";

interface Props {
  /** Changing this clears a caught error so the next media candidate can try. */
  resetKey: string;
  fallback: ReactNode;
  onError?: (error: unknown) => void;
  children: ReactNode;
}

interface State {
  failedKey: string | null;
}

/**
 * Catches a failed remote model/texture load (useGLTF/useTexture throw through Suspense) so the
 * pedestal can step down to the next media candidate instead of unmounting the whole room.
 */
export class MediaBoundary extends Component<Props, State> {
  state: State = { failedKey: null };

  static getDerivedStateFromError(): Partial<State> {
    return {};
  }

  componentDidCatch(error: unknown) {
    this.setState({ failedKey: this.props.resetKey });
    this.props.onError?.(error);
  }

  render() {
    if (this.state.failedKey !== null && this.state.failedKey === this.props.resetKey) return this.props.fallback;
    return this.props.children;
  }
}
