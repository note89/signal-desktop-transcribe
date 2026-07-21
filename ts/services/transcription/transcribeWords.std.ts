export type TranscriptionProviderType = 'elevenlabs' | 'whisper';

/** UI-facing state of one message's transcription */
export type TranscriptionEntry =
  | { status: 'loading' }
  | { status: 'done'; text: string }
  | { status: 'error'; error: string };

export type TranscribedWord = {
  text: string;
  start?: number;
  end?: number;
  type?: string;
};

export type TranscriptionResult = {
  text: string;
  error?: string;
};

// Pause longer than this between words starts a new paragraph
const PARAGRAPH_PAUSE_SECONDS = 1.0;

export function wordsToParagraphs(words: Array<TranscribedWord>): string {
  let result = '';
  let previousEnd: number | undefined;

  for (const word of words) {
    if (word.type === 'spacing') {
      result += word.text;
      continue;
    }
    if (
      previousEnd !== undefined &&
      word.start !== undefined &&
      word.start - previousEnd >= PARAGRAPH_PAUSE_SECONDS
    ) {
      result = `${result.trimEnd()}\n\n`;
    }
    result += word.text;
    previousEnd = word.end ?? previousEnd;
  }

  return result.trim();
}
