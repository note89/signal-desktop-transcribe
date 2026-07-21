<!-- Copyright 2014 Signal Messenger, LLC -->
<!-- SPDX-License-Identifier: AGPL-3.0-only -->

# Signal Desktop — with Voice Message Transcription (unofficial fork)

> **This is an unofficial fork.** It adds automatic transcription of voice
> messages, with three providers: **ElevenLabs** (cloud), **OpenAI whisper-1** (cloud) and
> **Whisper** via [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
> (fully local — audio never leaves your machine). Not affiliated with or
> endorsed by Signal Messenger LLC. Prebuilt macOS (Apple Silicon) downloads:
> <https://signal.borrowed.computer>

## What the fork adds

- Voice messages transcribe automatically as they scroll into view
- Transcript renders below the audio player, collapsible (auto-collapsed for 2min+ messages), split into paragraphs at natural speech pauses
- Provider choice in Settings → General: ElevenLabs (scribe_v2), OpenAI (whisper-1), or local whisper.cpp (auto-downloads the ggml-base model on first use, prewarms a local whisper-server for ~0.3s transcriptions)
- Transcripts persist on the message — each voice note is transcribed exactly once
- Regenerate / Retry actions under each transcript
- All network and subprocess work runs in the Electron main process over IPC; the renderer's no-network sandbox is untouched

To build: `pnpm install && pnpm run generate && pnpm start` (see `devenv.nix` for a reproducible environment). Auto-updates are disabled in this fork so the official updater never replaces your build.

---

Signal Desktop links with Signal on [Android](https://github.com/signalapp/Signal-Android) or [iOS](https://github.com/signalapp/Signal-iOS) and lets you message from your Windows, macOS, and Linux computers.

[Install the production version](https://signal.org/download/) or help us out by [installing the beta version](https://support.signal.org/hc/articles/360007318471-Signal-Beta).

## Got a question?

You can find answers to a number of frequently asked questions on our [support site](https://support.signal.org/).
The [community forum](https://community.signalusers.org/) is another good place for questions.

## Found a Bug?

Please search for any [existing issues](https://github.com/signalapp/Signal-Desktop/issues) that describe your bug in order to avoid duplicate submissions.

## Have a feature request, question, comment?

Please use our community forum: https://community.signalusers.org/

## Contributing to the project

Please see [CONTRIBUTING.md](https://github.com/signalapp/Signal-Desktop/blob/main/CONTRIBUTING.md). There are lots of ways to contribute - many that don't involve code!

## Donate to Signal

You can donate to Signal from inside Signal apps (Desktop, Android, or iOS), or via the web here: [Signal Technology Foundation](https://signal.org/donate). Signal is an independent 501c3 nonprofit.

## Cryptography Notice

This distribution includes cryptographic software. The country in which you currently reside may have restrictions on the import, possession, use, and/or re-export to another country, of encryption software.
BEFORE using any encryption software, please check your country's laws, regulations and policies concerning the import, possession, or use, and re-export of encryption software, to see if this is permitted.
See <http://www.wassenaar.org/> for more information.

The U.S. Government Department of Commerce, Bureau of Industry and Security (BIS), has classified this software as Export Commodity Control Number (ECCN) 5D002.C.1, which includes information security software using or performing cryptographic functions with asymmetric algorithms.
The form and manner of this distribution makes it eligible for export under the License Exception ENC Technology Software Unrestricted (TSU) exception (see the BIS Export Administration Regulations, Section 740.13) for both object code and source code.

## License

Copyright 2013-2024 Signal Messenger, LLC

Licensed under the GNU AGPLv3: https://www.gnu.org/licenses/agpl-3.0.html
