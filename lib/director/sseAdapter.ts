/**
 * Preserve the backend SSE contract verbatim. The frontend models the full mandate envelope, so
 * flattening it here would discard whether it contains a cart or a place plan.
 */
export function adaptCouncilStream(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  return upstream;
}
