// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// OpenAI speech-to-text. whisper-1 with verbose_json is used because it
// returns timed segments, which drive the paragraph splitting.

import { createLogger } from '../ts/logging/log.std.ts';
import type {
  TranscribedWord,
  TranscriptionResult,
} from '../ts/services/transcription/transcribeWords.std.ts';
import { wordsToParagraphs } from '../ts/services/transcription/transcribeWords.std.ts';

const log = createLogger('openAiTranscribe');

const API_URL = 'https://api.openai.com/v1/audio/transcriptions';
const MODEL = 'whisper-1';

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'audio/aac': 'm4a',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/wav': 'wav',
};

type OpenAiSegment = {
  start: number; // seconds
  end: number;
  text: string;
};

export async function transcribeWithOpenAi({
  data,
  contentType,
  apiKey,
}: {
  data: ArrayBuffer;
  contentType: string;
  apiKey: string;
}): Promise<TranscriptionResult> {
  try {
    const extension = EXTENSION_BY_CONTENT_TYPE[contentType] ?? 'm4a';
    const formData = new FormData();
    formData.append('model', MODEL);
    formData.append('response_format', 'verbose_json');
    formData.append(
      'file',
      new Blob([data], { type: contentType }),
      `audio.${extension}`
    );

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const body = await response.text();
      log.error(`transcribeWithOpenAi: HTTP ${response.status}: ${body}`);
      return { text: '', error: `OpenAI error: ${response.statusText}` };
    }

    const result = (await response.json()) as {
      text?: string;
      segments?: Array<OpenAiSegment>;
    };

    const segments = result.segments ?? [];
    if (segments.length > 0) {
      const asWords: Array<TranscribedWord> = segments.map(segment => ({
        text: segment.text,
        start: segment.start,
        end: segment.end,
      }));
      return { text: wordsToParagraphs(asWords) };
    }
    return { text: (result.text ?? '').trim() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`transcribeWithOpenAi: ${message}`);
    return { text: '', error: `Transcription failed: ${message}` };
  }
}
