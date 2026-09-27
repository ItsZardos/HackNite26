# HackNite26 · Undertone

A Chrome extension that gives written stories an adaptive instrumental soundtrack. Gemini scores the emotional arc; the music follows the section you are reading.

## Team quick start

Install **Node.js 22 or newer (including npm)**, **Git**, and **Google Chrome**. The same commands work in Windows PowerShell, macOS Terminal, and Linux:

```sh
git clone https://github.com/ItsZardos/HackNite26.git
cd HackNite26
npm run setup
npm start
```

`npm run setup` creates a local `.env` without overwriting an existing one, validates the bundled assets, and builds `dist-extension`. All required JavaScript libraries and eight audio loops are included. There are no npm dependencies to install, and Python is not required to run the app.

Open **http://127.0.0.1:8787**. Choose **Experience a story** to try the complete reader and soundtrack without an API key. The sample is clearly labeled as a curated score.

For live analysis, open `.env` in your editor, add your own `GEMINI_API_KEY`, and restart `npm start`. Keep `PORT=8787` for the extension. Never commit your key or share `.env` through GitHub. Each teammate runs their own local backend and keeps their credentials on their own machine.

## Load the extension

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Choose **Load unpacked** and select the `dist-extension` folder inside your checkout.
3. Pin Undertone using Chrome's extensions menu.
4. Click Undertone's toolbar icon to open its small menu.
5. Choose **Paste text** for a blank full-page reader, or **Scan page** to extract the current article into the reader.
6. Review the text and choose **Compose my reading experience** to send it to Gemini.
7. Press play. Scroll in either direction, or click the emotional timeline.

The popup closes as the reader tab opens. The background worker completes extraction and the handoff independently. Paste text does not inspect your current tab or read the clipboard.

## Pull teammates' updates

Save or commit your own work before pulling. From your checkout:

```sh
git pull --ff-only
npm run setup
npm test
```

Then click **Reload** on Undertone in `chrome://extensions`, and open a new reader tab from the popup. Restart `npm start` when server code or `.env` settings change. Setup preserves your existing `.env`; compare new `.env.example` fields when configuration changes.

For your own feature work, create a branch, commit your source changes, and open a pull request. `dist-extension` is generated and ignored by Git; teammates regenerate it locally.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run setup` | Create local settings if missing and build the extension |
| `npm start` | Run the local backend and web reader |
| `npm test` | Run unit/contract tests with Node's built-in runner |
| `npm run build` | Validate assets and rebuild `dist-extension` |
| `npm run music` | Optional: regenerate music with Python 3 (`python3`) |

On Windows, optional music regeneration can also use `py -3 scripts/generate_music.py`. The committed WAVs are ready to use. `launch.command` is an optional macOS launcher for an installed Node runtime; the npm commands are the shared team workflow.

## Included

- Manifest V3 toolbar popup with Paste text and Scan page.
- Mozilla Readability 0.6.0, bundled locally; main/body fallback and manual paste.
- Responsive luxury-style reader, eight moods, intensity, progress, timeline, volume, and play/pause.
- Paragraph-aware sections targeting 250–500 words. Final sections may be shorter; very long paragraphs are split.
- Gemini structured JSON with exact section coverage, bounded metadata, timeouts and useful errors.
- Eight original instrumental loops and four-second Web Audio crossfades. Latest scroll position wins during audio loading.
- Original short story and curated score for an offline extension demo. The web reader needs the local server to serve its files.
- Reduced motion, keyboard focus, and plain-text article rendering.

## Architecture

```
Toolbar popup → Scan page → worker → Readability → session storage → reader
              → Paste text → worker → blank reader
Reader → local Node backend → chunking → Gemini → validated emotional score
Viewport center → active section → visual mood + soundtrack crossfade
```

`extension/` contains the popup and worker. `reader/` contains browser ES modules. `server/` uses Node HTTP/fetch. `shared/` owns chunking and validation. `scripts/` handles setup and packaging. The extension build contains only browser assets, never the server or `.env`.

## Troubleshooting

- **Sample works, live analysis does not:** set `GEMINI_API_KEY` in `.env`, restart the server, and check the key's Gemini API access/quota. `GEMINI_MODEL` is configurable in `.env`.
- **Reader cannot reach server:** keep `npm start` running and use port 8787. The browser audio play button requires a user gesture.
- **Address already in use:** use the existing Undertone server or stop its terminal with Ctrl+C before starting another.
- **Chrome rejects the folder:** load `dist-extension`, not the repository root or `extension` source directory. Run `npm run setup` first.
- **Old popup still appears:** rebuild, click Reload in Chrome's extension manager, then open a fresh reader.
- **Scan fails:** Chrome internal pages, the Web Store, local files, and some protected sites cannot be extracted. Use Paste text. Extraction is capped at 100,000 characters.
- **Refreshing a scanned reader loses text:** extraction is a one-time session handoff. Scan again or paste it. Source text is not stored permanently.
- **Pull cannot fast-forward:** preserve your commits and resolve the diverged branch with your team; do not discard teammates' work.

## Security and privacy

No accounts or database. Text goes to Gemini only after the explicit compose action. The app does not log article bodies. The key remains server-side. `.gitignore` excludes `.env`, dependencies, generated extension files and logs.

The backend binds to loopback, validates Host/Origin and static paths, limits request sizes/concurrency, and rate-limits analysis. `EXTENSION_ID` can optionally restrict access to your installed extension's ID; leave it empty for local team development because IDs may differ between checkouts. This is a local hackathon backend, not an authenticated public service. Review Google's API terms before using sensitive material.

## Verification

GitHub Actions runs setup, tests, and extension build on Node 22 for Windows, macOS and Linux. Tests mock Gemini and Chrome APIs; real Gemini needs your key. Browser-rendered UI has been checked, but each teammate should verify the native toolbar flow after loading the extension:

Paste → reader; Scan article → reader; compose → play; scroll forward/back; pause/resume; change volume; try a restricted page and use the fallback.

## Demo and scope

“Movies use music to establish emotion, tension, and atmosphere. Undertone gives written stories the same capability. Gemini understands the emotional progression, and your scroll position controls the soundtrack.”

Demonstrate the live extraction/analysis flow, or identify the curated sample when using it. Its journey is calm → mysterious → tense → dark → hopeful. Allow four seconds for crossfades.

Music is original synthesized audio generated by `scripts/generate_music.py`, not Lyria. Lyria RealTime is an unimplemented stretch goal. No Raspberry Pi components are included.

## Previous repository content

The starter repository contained a single README at [commit 42a128d](https://github.com/ItsZardos/HackNite26/commit/42a128dcd8c4b1db89ccfdacfabfaeb30da3c913). Publish Undertone as a normal descendant commit so the original remains recoverable in Git history.

## References and licensing

- [Chrome popup](https://developer.chrome.com/docs/extensions/develop/ui/add-popup), [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging).
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output).
- [Mozilla Readability](https://github.com/mozilla/readability), Apache 2.0; license preserved in `extension/vendor/LICENSE.md`.
- Original project code, story and generated music: MIT; see LICENSE.
