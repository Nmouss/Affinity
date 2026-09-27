export * from "./types";
export * from "./select";
export { createWebSpeechRecognizer, createWebSpeechSpeaker, installOnDeviceSpeech } from "./webSpeech";
export type { RecognitionHost, RecognizerDeps, SpeechSynthesisLike, UtteranceLike, WebSpeechSpeakerDeps } from "./webSpeech";
export { buildListenUrl, createDeepgramRecognizer, DEEPGRAM_LISTEN_PARAMS, DEEPGRAM_LISTEN_URL } from "./deepgramRecognizer";
export type { DeepgramRecognizerDeps } from "./deepgramRecognizer";
export { createDeepgramSpeaker, fetchSpeechFromRoute } from "./deepgramSpeaker";
export type { DeepgramSpeakerDeps } from "./deepgramSpeaker";
export { SILENT_WAV_DATA_URI } from "./silentAudio";
