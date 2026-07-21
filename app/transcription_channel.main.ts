// Runs ElevenLabs speech-to-text in the main process so the renderer can stay
// blocked from making arbitrary network requests (see protocol_filter.node.ts).

import { app, ipcMain } from 'electron';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

import { createLogger } from '../ts/logging/log.std.ts';
import type {
  TranscribedWord,
  TranscriptionProviderType,
  TranscriptionResult,
} from '../ts/services/transcription/transcribeWords.std.ts';
import { wordsToParagraphs } from '../ts/services/transcription/transcribeWords.std.ts';
import {
  ensureWhisperServer,
  shutdownWhisperServer,
  transcribeWithWhisper,
} from './whisperTranscribe.node.ts';

const log = createLogger('transcription_channel');

export type TranscribeAudioRequest = {
  data: ArrayBuffer;
  contentType: string;
  apiKey: string | undefined;
  provider: TranscriptionProviderType | undefined;
  whisperPath: string | undefined;
};

export function installTranscriptionHandler(): void {
  ipcMain.handle('transcribe-prewarm', async () => {
    await ensureWhisperServer();
  });

  app.on('will-quit', () => {
    shutdownWhisperServer();
  });

  ipcMain.handle(
    'transcribe-audio',
    async (
      _event,
      { data, contentType, apiKey, provider, whisperPath }: TranscribeAudioRequest
    ): Promise<TranscriptionResult> => {
      if (provider === 'whisper') {
        return transcribeWithWhisper({
          data,
          contentType,
          customBinaryPath: whisperPath,
        });
      }

      const key = apiKey || process.env.ELEVEN_LABS_API_KEY;
      if (!key) {
        return {
          text: '',
          error: 'No API key. Add one in Settings → General.'
        };
      }

      try {
        const client = new ElevenLabsClient({ apiKey: key });
        const file = new Blob([data], { type: contentType });
        const transcription = await client.speechToText.convert({
          file,
          modelId: 'scribe_v2',
          tagAudioEvents: false,
          diarize: false,
        });

        if ('text' in transcription) {
          const words = (
            transcription as { words?: Array<TranscribedWord> }
          ).words;
          const text =
            words && words.length > 0
              ? wordsToParagraphs(words)
              : (transcription.text ?? '');
          return { text };
        }
        return { text: '', error: 'Unexpected transcription response shape' };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`transcribe-audio: ${message}`);
        return { text: '', error: `Transcription failed: ${message}` };
      }
    }
  );
}
