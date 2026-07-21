// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// Renderer-side bridge to the transcription handler in the main process.
// All network and subprocess work happens there so the renderer keeps its
// no-network sandbox (see app/protocol_filter.node.ts).

import { ipcRenderer } from 'electron';

import type {
  TranscriptionProviderType,
  TranscriptionResult,
} from './transcribeWords.std.ts';

export async function transcribeAudio({
  data,
  contentType,
  apiKey,
  provider,
  whisperPath,
}: {
  data: ArrayBuffer;
  contentType: string;
  apiKey: string | undefined;
  provider: TranscriptionProviderType | undefined;
  whisperPath: string | undefined;
}): Promise<TranscriptionResult> {
  return ipcRenderer.invoke('transcribe-audio', {
    data,
    contentType,
    apiKey,
    provider,
    whisperPath,
  });
}

export async function prewarmTranscription(): Promise<void> {
  await ipcRenderer.invoke('transcribe-prewarm');
}
