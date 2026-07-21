// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { ThunkAction } from 'redux-thunk';
import type { ReadonlyDeep } from 'type-fest';

import type { StateType as RootStateType } from '../reducer.preload.ts';
import { createLogger } from '../../logging/log.std.ts';
import { transcribeAudio } from '../../services/transcription/transcribeIpc.preload.ts';
import { getMessageById } from '../../messages/getMessageById.preload.ts';
import type { TranscriptionEntry } from '../../services/transcription/transcribeWords.std.ts';
import type { AttachmentForUIType } from '../../types/Attachment.std.ts';

const log = createLogger('voiceTranscription');

// State

export type TranscriptionState = ReadonlyDeep<{
  [messageId: string]: TranscriptionEntry;
}>;

const initialState: TranscriptionState = {};

// Actions

const SET_LOADING = 'voiceTranscription/SET_LOADING';
const SET_DONE = 'voiceTranscription/SET_DONE';
const SET_ERROR = 'voiceTranscription/SET_ERROR';

type SetLoadingAction = ReadonlyDeep<{
  type: typeof SET_LOADING;
  payload: { messageId: string };
}>;

type SetDoneAction = ReadonlyDeep<{
  type: typeof SET_DONE;
  payload: { messageId: string; text: string };
}>;

type SetErrorAction = ReadonlyDeep<{
  type: typeof SET_ERROR;
  payload: { messageId: string; error: string };
}>;

type VoiceTranscriptionAction =
  | SetLoadingAction
  | SetDoneAction
  | SetErrorAction;

export function setLoading(messageId: string): SetLoadingAction {
  return { type: SET_LOADING, payload: { messageId } };
}

export function setDone(messageId: string, text: string): SetDoneAction {
  return { type: SET_DONE, payload: { messageId, text } };
}

export function setError(messageId: string, error: string): SetErrorAction {
  return { type: SET_ERROR, payload: { messageId, error } };
}

// Reducer

export function reducer(
  state: TranscriptionState = initialState,
  action: VoiceTranscriptionAction
): TranscriptionState {
  switch (action.type) {
    case SET_LOADING:
      return {
        ...state,
        [action.payload.messageId]: { status: 'loading' },
      };
    case SET_DONE:
      return {
        ...state,
        [action.payload.messageId]: {
          status: 'done',
          text: action.payload.text,
        },
      };
    case SET_ERROR:
      return {
        ...state,
        [action.payload.messageId]: {
          status: 'error',
          error: action.payload.error,
        },
      };
    default:
      return state;
  }
}

// Thunks

export function transcribeVoiceMessage(
  messageId: string,
  attachment: AttachmentForUIType
): ThunkAction<void, RootStateType, unknown, VoiceTranscriptionAction> {
  return async (dispatch, getState) => {
    const {
      transcriptionApiKey: apiKey,
      transcriptionProvider: provider,
      transcriptionWhisperPath: whisperPath,
    } = getState().items;

    dispatch(setLoading(messageId));

    try {
      const url = attachment.url;
      if (!url) {
        dispatch(setError(messageId, 'Attachment not yet downloaded'));
        return;
      }

      // attachment:// URL — served (and decrypted) by Electron protocol handler
      const response = await fetch(url);
      if (!response.ok) {
        dispatch(
          setError(messageId, `Failed to load attachment: ${response.status}`)
        );
        return;
      }
      const audio = await response.arrayBuffer();
      const result = await transcribeAudio({
        data: audio,
        contentType: attachment.contentType || 'audio/aac',
        apiKey,
        provider,
        whisperPath,
      });

      if (result.error) {
        dispatch(setError(messageId, result.error));
        return;
      }

      dispatch(setDone(messageId, result.text));

      // Persist so we never transcribe the same message twice
      const message = await getMessageById(messageId);
      if (message) {
        message.set({ voiceTranscription: result.text });
        await window.MessageCache.saveMessage(message.attributes);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`transcribeVoiceMessage: ${messageId}: ${message}`);
      dispatch(setError(messageId, `Failed to transcribe: ${message}`));
    }
  };
}
