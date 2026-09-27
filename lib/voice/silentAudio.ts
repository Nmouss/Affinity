// A valid, silent 8 kHz mono 8-bit WAV of 8 samples (52 bytes) as a data URI. Playing it inside a
// click "unlocks" an <audio> element on browsers with strict autoplay policies (Safari), so later
// programmatic play() calls with real speech succeed.

function wavHeader(dataLength: number): number[] {
  const le32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255];
  const le16 = (n: number) => [n & 255, (n >> 8) & 255];
  const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
  return [
    ...ascii("RIFF"),
    ...le32(36 + dataLength),
    ...ascii("WAVE"),
    ...ascii("fmt "),
    ...le32(16),
    ...le16(1), // PCM
    ...le16(1), // mono
    ...le32(8000),
    ...le32(8000), // byte rate: 8000 * 1 * 1
    ...le16(1), // block align
    ...le16(8), // bits per sample
    ...ascii("data"),
    ...le32(dataLength),
  ];
}

const SILENT_SAMPLES = 8;
const bytes = [...wavHeader(SILENT_SAMPLES), ...new Array<number>(SILENT_SAMPLES).fill(128)];

function toBase64(values: number[]): string {
  const binary = String.fromCharCode(...values);
  if (typeof btoa === "function") return btoa(binary);
  return Buffer.from(binary, "binary").toString("base64");
}

export const SILENT_WAV_DATA_URI = `data:audio/wav;base64,${toBase64(bytes)}`;
