# Sotto

*sotto voce — in a quiet voice*

A Chrome extension that captures live captions from **Google Meet** and the
**Zoom web client** into local transcripts. Built for conversations that are
nobody else's business.

## Why

Every meeting-transcription SaaS works the same way: your call audio or
captions go to their servers, get stored, and feed their models. That is a
non-starter for private conversations — therapy, medical, legal, personal.

Sotto takes the opposite approach:

- **No servers.** The extension makes zero network requests. Grep the source —
  there is no `fetch` in it.
- **No accounts, no subscription.** It reads the captions Meet/Zoom already
  render in your browser and saves them to `chrome.storage.local`.
- **No audio processing.** Sotto does not record or transcribe audio; it
  collects the caption text the platform itself produces. Turn captions on,
  Sotto does the rest.
- **Works from a background tab.** Captions are captured with a
  MutationObserver, which Chrome does not throttle when the tab is hidden —
  switching away from the call tab does not lose transcript.
- **You own the output.** Export any session as Markdown or plain text with
  one click; delete it just as easily. When a call tab closes, the transcript
  is also auto-saved as `.txt` to `Downloads/Sotto/` (toggle in the popup).

## Install

From source (the auditable way — the code you read is the code you run):

1. Clone this repo.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the repo directory.

A Chrome Web Store listing is on its way for one-click installs; the source
here always stays the reference. See [PRIVACY.md](PRIVACY.md) for the privacy
policy (spoiler: nothing is collected).

## Use

1. Join a call in Google Meet or Zoom **in the browser** (not the desktop app).
2. Turn on captions (**CC** in Meet; **Show captions** in Zoom — in Zoom the
   host must have captions enabled, and opening *View full transcript* gives
   better history than the subtitle overlay).
3. Sotto captures in the background; the extension icon shows a **REC** badge.
4. Open the popup to export or delete transcripts.

## HQ recording (local Whisper)

Platform captions are convenient but mediocre, especially for Russian. HQ
mode records the call audio and transcribes it with a local Whisper model —
quality is dramatically better, and audio still never leaves the machine:
the only network target is `127.0.0.1`.

### One-time setup (macOS)

1. Install the Whisper engine:

   ```sh
   brew install whisper-cpp
   ```

2. Start the server — the first run downloads the model (~1.6 GB) into
   `~/.sotto/models`:

   ```sh
   ./scripts/whisper-server.sh
   ```

   Recommended: install the launchd agent instead, so the server starts at
   login and restarts on crash — then you never think about it again:

   ```sh
   ./scripts/install-launchd.sh
   ```

   Idle cost of the always-on server: ~1.8 GB RAM, zero CPU/GPU.

   No repo checkout? The script boils down to:

   ```sh
   mkdir -p ~/.sotto/models
   curl -L -o ~/.sotto/models/ggml-large-v3-turbo.bin \
     https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
   whisper-server -m ~/.sotto/models/ggml-large-v3-turbo.bin --host 127.0.0.1 --port 8123
   ```

3. Grant microphone access on first use: the first **Start HQ** opens a
   one-time permission page. Without it only the other side of the call is
   transcribed.

### Recording

1. Be on the call tab (Meet, Zoom — any tab with audio, actually).
2. Sotto popup → pick the Whisper language (`ru`/`en`/`auto`) → **Start HQ**.
   The extension icon shows a green **HQ** badge while recording.
3. Two channels are captured: the tab (labeled «Собеседник») and your mic
   («Вы») — speaker attribution for free. Chunks are cut on silence
   boundaries, so entries appear with a 10–25 s delay.
4. **Stop HQ** when done — or just close the tab: the recording stops and
   the transcript auto-saves like any other session.

Caption capture keeps working in parallel — it's the fallback and the source
of real speaker names.

### Troubleshooting

- Popup says **whisper-server not running**: check `curl http://127.0.0.1:8123/`;
  agent logs are in `~/.sotto/logs/whisper-server.log`.
- Port 8123 is taken: the port is currently fixed on the extension side —
  free the port (or change `WHISPER_PORT` in `src/popup/popup.js` and
  `SOTTO_WHISPER_PORT` for the server, and reload the extension).
- No «Вы» entries: microphone permission was not granted — start a recording
  and accept the permission page it opens.

## When it breaks

Meet and Zoom change their DOM without notice. All selectors live in one
place — [`src/selectors.js`](src/selectors.js) — with instructions at the top.
If capture stops working, that file is almost certainly the fix, and PRs
updating it are welcome.

Zoom specifics (verified against several open-source caption scrapers): the
meeting UI is rendered inside a same-origin iframe `#webclient`, the subtitle
overlay is `.live-transcription-subtitle__box` (each child is one speaker
turn: avatar image + caption text; the speaker name is recovered from the
participant tile showing the same avatar), and the full transcript panel uses
`.lt-full-transcript__item`. If only the overlay is available, Zoom shows a
short rolling window — open *View full transcript* for reliable history.

## Privacy model, honestly stated

- Transcripts live unencrypted in your Chrome profile
  (`chrome.storage.local`), so they are as private as the machine and browser
  profile you use. Anyone with access to your profile can read them.
- Chrome profile sync does not sync `storage.local`, but exported files go
  wherever you save them — treat them accordingly.
- Captions are generated by Google/Zoom as part of the call; Sotto neither
  adds to nor prevents whatever the platform itself does with them.

## License

[MIT](LICENSE)
