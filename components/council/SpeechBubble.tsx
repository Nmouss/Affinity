export function SpeechBubble({ speaker, children }: { speaker: string; children: React.ReactNode }) {
  return <blockquote><strong>{speaker}</strong><p>{children}</p></blockquote>;
}
