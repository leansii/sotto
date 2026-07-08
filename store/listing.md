# Chrome Web Store listing materials

Copy-paste source for the Developer Dashboard. Keep in sync with the manifest
on every release.

## Name

Sotto — local meeting transcripts

## Summary (max 132 chars)

Private transcripts for Meet & Zoom calls. Captions or local Whisper — no
servers, no accounts, nothing leaves your machine.

## Category

Productivity → Tools (fits best; alternative: Accessibility)

## Description

Sotto captures transcripts of your Google Meet and Zoom (web) calls and keeps
them where they belong: on your computer.

Every meeting-transcription service works the same way — your call audio goes
to their servers, gets stored there, and feeds their models. That is a
non-starter for conversations that are nobody else's business: therapy,
medical, legal, personal.

Sotto takes the opposite approach:

▸ NO SERVERS — the extension makes zero requests to the internet. The code is
open source and small enough to audit in one sitting.
▸ NO ACCOUNTS, NO SUBSCRIPTION — nothing to sign up for, nothing to pay
monthly.
▸ CAPTION CAPTURE — Sotto collects the live captions Meet and Zoom already
render in your browser, with speaker names and timestamps. It can turn
captions on automatically and switch the Meet caption language for you.
▸ HQ MODE (optional) — record the call audio and transcribe it with a Whisper
AI model running on your own computer (one-time setup, guide included).
Quality far beyond built-in captions, in your language. The audio's only
destination is 127.0.0.1 — your machine.
▸ YOUR OUTPUT — sessions live in local browser storage; export any of them as
Markdown or plain text with one click, or let Sotto auto-save a .txt when the
call ends. Delete anything just as easily.

Two speaker channels in HQ mode (your microphone vs. the call audio) give
automatic "you / them" attribution — ideal for reviewing therapy sessions,
coaching calls, or interviews.

Sotto is open source: https://github.com/leansii/sotto

Note: caption capture requires captions to be available in the call (for Zoom,
the host account must have automated captions enabled). HQ mode requires
installing the free open-source whisper.cpp engine locally — the extension
walks you through it.

## Single purpose (dashboard field)

Sotto has one purpose: creating local, private transcripts of the user's own
video calls (Google Meet, Zoom web) — from platform captions or from call
audio transcribed by a local AI model on the user's machine.

## Permission justifications (dashboard fields)

- **storage / unlimitedStorage**: Transcripts are stored exclusively in
  chrome.storage.local on the user's device; long recordings can exceed the
  default quota.
- **downloads**: Auto-saves the finished transcript as a .txt file to the
  user's Downloads folder when a call ends.
- **tabCapture**: Core of HQ mode — captures the call tab's audio so it can be
  transcribed by a local Whisper server on the user's own machine (127.0.0.1).
  Audio is never sent to the internet.
- **activeTab**: Required by tabCapture; capture starts only after the user
  explicitly clicks "Start HQ" in the popup on the call tab.
- **offscreen**: Hosts the audio processing (MV3 service workers cannot hold
  media streams). Reason: USER_MEDIA.
- **Host permission http://127.0.0.1:8123, http://localhost:8123**: The local
  Whisper transcription server the user runs on their own computer. This is
  the extension's only network destination.
- **Content scripts on meet.google.com, *.zoom.us/wc**: Read the live captions
  those pages render, to build the transcript locally.
- **Microphone (getUserMedia)**: Optional second HQ channel so the user's own
  voice is transcribed and attributed; requested via an explicit one-time
  permission page.

## Data usage disclosures (dashboard checkboxes)

- Collects user data: **No** for every category (no PII, no auth info, no
  personal communications *collected* — everything is processed and stored
  locally; nothing is transmitted off the device).
- Certify: does not sell data, does not use/transfer for purposes unrelated
  to the single purpose, does not use/transfer to determine creditworthiness.

## Assets

- Icon 128×128: `icons/icon-128.png`
- Screenshot 1280×800: `store/screenshot-1.png`
- Small promo tile 440×280: generate (see prompt in project notes) — optional
  but recommended for public listings.

## Privacy policy URL

https://github.com/leansii/sotto/blob/main/PRIVACY.md
