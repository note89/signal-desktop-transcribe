// Local transcription. Prefers a persistent whisper-server (model stays
// loaded in RAM), then one-shot whisper-cli, then the openai-whisper python
// CLI (`pip install openai-whisper`).

import { execFile, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { promisify } from 'node:util';
import { accessSync, constants, existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { createLogger } from '../ts/logging/log.std.ts';
import type {
  TranscribedWord,
  TranscriptionResult,
} from '../ts/services/transcription/transcribeWords.std.ts';
import { wordsToParagraphs } from '../ts/services/transcription/transcribeWords.std.ts';

const log = createLogger('whisperTranscribe');

const execFileAsync = promisify(execFile);

// GUI apps get a minimal PATH; include the places whisper usually lives
const EXTRA_BIN_DIRS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  join(homedir(), '.local', 'bin'),
];

// whisper.cpp binary names, in order of preference, then the python CLI
const WHISPER_CPP_BINARIES = ['whisper-cli', 'whisper-cpp'];
const WHISPER_PYTHON_BINARY = 'whisper';

const MODEL_DIR = join(homedir(), '.cache', 'whisper-cpp');
const MODEL_PATH = join(MODEL_DIR, 'ggml-base.bin');
const MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/wav': 'wav',
};

// Voice notes often carry contentType audio/aac while the bytes are an MP4
// container; afconvert needs the extension to match the container, so sniff.
function detectExtension(data: Buffer, contentType: string): string {
  if (data.length >= 12 && data.toString('latin1', 4, 8) === 'ftyp') {
    return 'm4a';
  }
  if (data.toString('latin1', 0, 4) === 'OggS') {
    return 'ogg';
  }
  if (data.toString('latin1', 0, 4) === 'RIFF') {
    return 'wav';
  }
  if (data.toString('latin1', 0, 3) === 'ID3') {
    return 'mp3';
  }
  if (data.length >= 2 && data[0] === 0xff && (data[1] & 0xf6) === 0xf0) {
    return 'aac'; // raw ADTS
  }
  return EXTENSION_BY_CONTENT_TYPE[contentType] ?? 'm4a';
}

function resolveCustomBinary(path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
  }
  if (existsSync(path)) {
    try {
      accessSync(path, constants.X_OK);
      return path;
    } catch {
      // fall through
    }
  }
  log.warn(`custom whisper binary not usable: ${path}`);
  return undefined;
}

function findBinary(name: string): string | undefined {
  const pathDirs = (process.env.PATH ?? '').split(delimiter);
  for (const dir of [...pathDirs, ...EXTRA_BIN_DIRS]) {
    if (!dir) {
      continue;
    }
    const candidate = join(dir, name);
    if (existsSync(candidate)) {
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // not executable; keep looking
      }
    }
  }
  return undefined;
}

async function ensureModel(): Promise<string> {
  if (existsSync(MODEL_PATH)) {
    return MODEL_PATH;
  }

  log.info(`downloading whisper model to ${MODEL_PATH}`);
  await mkdir(MODEL_DIR, { recursive: true });

  const response = await fetch(MODEL_URL);
  if (!response.ok || !response.body) {
    throw new Error(`model download failed: HTTP ${response.status}`);
  }

  const partialPath = `${MODEL_PATH}.partial`;
  await pipeline(
    Readable.fromWeb(response.body as never),
    createWriteStream(partialPath)
  );
  await execFileAsync('mv', [partialPath, MODEL_PATH]);
  log.info('whisper model downloaded');
  return MODEL_PATH;
}

// --- Persistent whisper-server (prewarmed model) ---

const SERVER_BINARY = 'whisper-server';
const SERVER_START_TIMEOUT_MS = 30 * 1000;

type WhisperServerState = {
  child: ChildProcess;
  port: number;
};

let serverState: WhisperServerState | undefined;
let serverStarting: Promise<WhisperServerState | undefined> | undefined;

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (address == null || typeof address === 'string') {
        probe.close(() => reject(new Error('no port')));
        return;
      }
      probe.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(port: number): Promise<void> {
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, { method: 'GET' });
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw new Error('whisper-server did not become ready in time');
}

export async function ensureWhisperServer(): Promise<
  WhisperServerState | undefined
> {
  if (serverState) {
    return serverState;
  }
  if (serverStarting) {
    return serverStarting;
  }

  serverStarting = (async () => {
    const binary = findBinary(SERVER_BINARY);
    if (!binary) {
      return undefined;
    }
    const model = await ensureModel();
    const port = await getFreePort();

    log.info(`starting whisper-server on port ${port}`);
    const child = spawn(
      binary,
      ['-m', model, '--host', '127.0.0.1', '--port', String(port)],
      { stdio: 'ignore' }
    );
    child.once('exit', code => {
      log.info(`whisper-server exited with code ${code}`);
      serverState = undefined;
    });

    await waitForServer(port);
    serverState = { child, port };
    log.info('whisper-server ready');
    return serverState;
  })();

  try {
    return await serverStarting;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`ensureWhisperServer: ${message}`);
    return undefined;
  } finally {
    serverStarting = undefined;
  }
}

export function shutdownWhisperServer(): void {
  if (serverState) {
    serverState.child.kill();
    serverState = undefined;
  }
}

type ServerSegment = {
  start: number; // seconds
  end: number;
  text: string;
};

async function transcribeViaServer(
  server: WhisperServerState,
  wavPath: string
): Promise<TranscriptionResult> {
  const wavData = await readFile(wavPath);
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([wavData], { type: 'audio/wav' }),
    'audio.wav'
  );
  formData.append('response_format', 'verbose_json');

  const response = await fetch(
    `http://127.0.0.1:${server.port}/inference`,
    { method: 'POST', body: formData }
  );
  if (!response.ok) {
    throw new Error(`whisper-server HTTP ${response.status}`);
  }

  const result = (await response.json()) as {
    text?: string;
    segments?: Array<ServerSegment>;
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
}

type WhisperCppSegment = {
  offsets: { from: number; to: number }; // milliseconds
  text: string;
};

// whisper.cpp wants 16kHz mono WAV; afconvert ships with macOS
async function convertTo16kWav(
  audioPath: string,
  workDir: string
): Promise<string> {
  const wavPath = join(workDir, 'audio-16k.wav');
  await execFileAsync('afconvert', [
    '-f', 'WAVE',
    '-d', 'LEI16@16000',
    '-c', '1',
    audioPath,
    wavPath,
  ]);
  return wavPath;
}

async function transcribeWithWhisperCpp(
  binary: string,
  audioPath: string,
  workDir: string
): Promise<TranscriptionResult> {
  const model = await ensureModel();
  const wavPath = await convertTo16kWav(audioPath, workDir);

  const outPrefix = join(workDir, 'result');
  await execFileAsync(
    binary,
    [
      '-m', model,
      '-f', wavPath,
      '-l', 'auto',
      '-oj',
      '-of', outPrefix,
      '--no-prints',
    ],
    { timeout: 10 * 60 * 1000 }
  );

  const resultJson = await readFile(`${outPrefix}.json`, 'utf8');
  const result = JSON.parse(resultJson) as {
    transcription?: Array<WhisperCppSegment>;
  };

  const segments = result.transcription ?? [];
  if (segments.length === 0) {
    return { text: '' };
  }
  const asWords: Array<TranscribedWord> = segments.map(segment => ({
    text: segment.text,
    start: segment.offsets.from / 1000,
    end: segment.offsets.to / 1000,
  }));
  return { text: wordsToParagraphs(asWords) };
}

type WhisperPythonSegment = {
  start: number;
  end: number;
  text: string;
};

async function transcribeWithWhisperPython(
  binary: string,
  audioPath: string,
  workDir: string
): Promise<TranscriptionResult> {
  await execFileAsync(
    binary,
    [
      audioPath,
      '--model', 'base',
      '--output_format', 'json',
      '--output_dir', workDir,
      '--fp16', 'False',
      '--verbose', 'False',
    ],
    { timeout: 10 * 60 * 1000 }
  );

  const resultJson = await readFile(join(workDir, 'audio.json'), 'utf8');
  const result = JSON.parse(resultJson) as {
    text?: string;
    segments?: Array<WhisperPythonSegment>;
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
}

export async function transcribeWithWhisper({
  data,
  contentType,
  customBinaryPath,
}: {
  data: ArrayBuffer;
  contentType: string;
  customBinaryPath?: string;
}): Promise<TranscriptionResult> {
  const customBinary = resolveCustomBinary(customBinaryPath);
  const serverBinary = findBinary(SERVER_BINARY);
  const cppBinary =
    customBinary ?? WHISPER_CPP_BINARIES.map(findBinary).find(Boolean);
  const pythonBinary =
    serverBinary || cppBinary ? undefined : findBinary(WHISPER_PYTHON_BINARY);

  if (!serverBinary && !cppBinary && !pythonBinary) {
    return {
      text: '',
      error:
        'Whisper not found. Install with "brew install whisper-cpp", ' +
        '"pip install openai-whisper", or set a binary path in Settings.'
    };
  }

  const buffer = Buffer.from(data);
  const extension = detectExtension(buffer, contentType);
  const workDir = await mkdtemp(join(tmpdir(), 'signal-whisper-'));
  const audioPath = join(workDir, `audio.${extension}`);

  try {
    await writeFile(audioPath, buffer);

    // A custom binary means the user wants that exact binary, not the server
    const server = customBinary ? undefined : await ensureWhisperServer();
    if (server) {
      const wavPath = await convertTo16kWav(audioPath, workDir);
      return await transcribeViaServer(server, wavPath);
    }
    if (cppBinary) {
      return await transcribeWithWhisperCpp(cppBinary, audioPath, workDir);
    }
    if (pythonBinary) {
      return await transcribeWithWhisperPython(pythonBinary, audioPath, workDir);
    }
    throw new Error('unreachable');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`transcribeWithWhisper: ${message}`);
    return { text: '', error: `Whisper failed: ${message}` };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
