// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import {
  reducer,
  setLoading,
  setDone,
  setError,
} from '../../state/ducks/voiceTranscription.preload.ts';
import type { TranscriptionState } from '../../state/ducks/voiceTranscription.preload.ts';
import { wordsToParagraphs } from '../../services/transcription/transcribeWords.std.ts';

describe('wordsToParagraphs', () => {
  it('joins words without long pauses into one paragraph', () => {
    const text = wordsToParagraphs([
      { text: 'Hello', start: 0, end: 0.5 },
      { text: ' ', type: 'spacing' },
      { text: 'world', start: 0.6, end: 1.0 },
    ]);
    assert.equal(text, 'Hello world');
  });

  it('starts a new paragraph after a pause of 1s or more', () => {
    const text = wordsToParagraphs([
      { text: 'First', start: 0, end: 0.5 },
      { text: ' ', type: 'spacing' },
      { text: 'Second', start: 2.0, end: 2.5 },
    ]);
    assert.equal(text, 'First\n\nSecond');
  });

  it('handles segments without timestamps', () => {
    const text = wordsToParagraphs([{ text: 'Only' }, { text: ' text' }]);
    assert.equal(text, 'Only text');
  });
});

describe('voiceTranscription reducer', () => {
  it('sets loading state', () => {
    const state = reducer(undefined, setLoading('msg-1'));
    assert.deepEqual(state['msg-1'], { status: 'loading' });
  });

  it('sets done state with transcript', () => {
    const state = reducer(undefined, setDone('msg-1', 'Hello world'));
    assert.deepEqual(state['msg-1'], { status: 'done', text: 'Hello world' });
  });

  it('sets error state', () => {
    const state = reducer(undefined, setError('msg-1', 'API error'));
    assert.deepEqual(state['msg-1'], { status: 'error', error: 'API error' });
  });

  it('handles multiple messages independently', () => {
    let state: TranscriptionState = reducer(undefined, setDone('msg-1', 'First'));
    state = reducer(state, setDone('msg-2', 'Second'));

    assert.equal(state['msg-1']?.status, 'done');
    assert.equal(state['msg-2']?.status, 'done');
  });

  it('replaces previous state for the same message', () => {
    let state: TranscriptionState = reducer(undefined, setLoading('msg-1'));
    state = reducer(state, setDone('msg-1', 'Done!'));

    assert.deepEqual(state['msg-1'], { status: 'done', text: 'Done!' });
  });
});
