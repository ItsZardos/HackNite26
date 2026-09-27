# HackNite26 · Undertone

A Chrome extension that turns reading into an adaptive instrumental soundtrack. Paste or scan in the toolbar popup; open the finalized text directly in a full reader.

Use **Google Chrome**, **Git**, and **Node.js 22 or newer with npm** on Windows, macOS, or Linux. Each teammate runs the local server on their own computer. The extension is not installed by signing into GitHub or opening a repository in VS Code.

## 1. Get the files

Open **PowerShell / Command Prompt on Windows**, or **Terminal on macOS / Linux**:

```sh
git clone https://github.com/ItsZardos/HackNite26.git
cd HackNite26
npm run setup
```

Already have a checkout? Save your local work, then run `git pull --ff-only` and `npm run setup` in its folder. A local Git clone is needed; a virtual GitHub repository in VS Code does not run the Node server.

On Windows, if PowerShell blocks `npm.ps1`, use `npm.cmd run setup` and `npm.cmd start`, or use Command Prompt. There is no need to change PowerShell's security policy.

## 2. Add your Gemini key and start the server

Setup creates `.env` without replacing an existing one. Open it in VS Code and set:

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.8-flash
```

Use your own key from [Google AI Studio](https://aistudio.google.com/apikey). Keep `PORT=8787` and leave `EXTENSION_ID` empty for team development. Never commit or send your `.env` to GitHub.

```sh
npm start
```

Leave that terminal running. It should print `Undertone ready at http://127.0.0.1:8787`. Restart it whenever you change `.env` or server code. No npm dependencies or Python installation are needed to run Undertone.

## 3. Install the extension

In Chrome on **any of the three operating systems**:

1. Open `chrome://extensions`.
2. Enable **Developer mode** at the top right.
3. Click **Load unpacked**.
4. Select the **dist-extension** folder inside your local `HackNite26` checkout. Select the folder itself, not a ZIP, `extension`, or the repository root.
5. Open Chrome's extensions menu (the puzzle-piece icon) and pin **Undertone**.

Windows folder example: `C:\Users\YourName\HackNite26\dist-extension`.
macOS/Linux folder example: your `HackNite26/dist-extension` folder wherever you cloned it. You do not need to move the files to a special location.

## 4. Use the two screens

**Screen 1 — toolbar popup.** Click Undertone's pinned icon. Choose **Paste text**, paste inside that popup, then choose **Open reader**. Or choose **Scan page** on an article: Readability extracts text, and Gemini removes obvious navigation, ads, cookie notices, and other page furniture while scoring the retained text. Gemini selects original paragraphs rather than rewriting them.

**Screen 2 — full reader tab.** After the text and soundtrack score are ready, the extension opens the full reader directly. There is no home page or intermediate entry form. Press **Play** and scroll to change the music. **New text** reopens the popup when supported; otherwise click the toolbar icon again.

Text is sent to Gemini when you submit pasted text or click Scan page. The popup shows progress and errors. A missing key or unreadable page leaves the popup open so you can retry or paste manually. Pages such as `chrome://` and the Chrome Web Store cannot be scanned.

## 5. Pull updates

```sh
git pull --ff-only
npm run setup
npm test
```

If your existing `.env` still selects `gemini-2.5-flash`, change that line to `GEMINI_MODEL=gemini-3.8-flash`. Setup preserves local configuration, so pulling alone will not update it. Keep your API key in `.env`; do not commit it.

Restart `npm start`. In `chrome://extensions`, click **Reload** on Undertone. Close old reader tabs and open a fresh one from the popup. The build is local and ignored by Git; every teammate must run setup after pulling changes.

## Audio checks

All eight committed `.wav` files are complete 16-second PCM audio files. They are bundled inside the extension, so playback does not fetch music from GitHub.

- In VS Code, right-click an audio file's editor tab and choose **Reopen Editor With → Audio Preview**. If using a virtual GitHub repository or a restricted preview, clone locally and open the file there.
- With the server running, open `http://127.0.0.1:8787/public/music/calm.wav` in Chrome to test the native player.
- Open `http://127.0.0.1:8787` and choose **Try sample text** for a local reader/audio check without an API key. This is a development fallback, not an extra step in the extension flow.
- If the player says it is playing but you hear nothing, check the tab/site mute control, system output device, and both volume controls. Missing files or decoding failures now give explicit messages.
- If nothing changed after pulling, rebuild and reload the extension: it uses a copied build, not the source folder.

## Development

`npm test` runs Node's built-in tests. `npm run build` rebuilds the extension. GitHub Actions runs setup, tests and build on Node 22 for Windows, macOS and Linux. Tests mock Gemini and Chrome APIs; live scoring requires an API key and native toolbar testing requires Chrome.

`extension/` owns the popup, extraction, and background handoff. `reader/` owns reading, scroll tracking and Web Audio. `server/` owns Gemini and local file delivery. `shared/` owns chunking and metadata validation. Bundled WAVs and Mozilla Readability require no installation.

Scans use one structured Gemini request for paragraph selection and emotional scoring. The server validates paragraph IDs and reconstructs text from original paragraphs. Pasted text is scored without page cleanup. Both flows finish before a reader tab is opened. Reader sessions stay in extension session storage to support refresh; restarting Chrome clears them, and only the latest ten sessions are retained.

The backend binds to loopback, validates Host/Origin and static paths, and limits request sizes/concurrency. Keys remain server-side. A streaming JSON response starts promptly while analysis runs so the extension worker can wait for Gemini. Audio endpoints support lengths, HEAD and byte ranges for native players. Music starts with a short fade and changes moods with four-second crossfades.

`npm run music` optionally regenerates the original loops with Python 3; on Windows use `py -3 scripts/generate_music.py` if `python3` is not available. The committed files are ready to play. `launch.command` is an optional macOS shortcut; the npm commands are the supported shared workflow.

No Raspberry Pi components are included. Music is original synthesized audio, not Lyria. The sample story uses a labeled curated score. Lyria RealTime is a stretch goal.

## History and licenses

The original starter README is preserved on [archive/pre-undertone-2026-09-27](https://github.com/ItsZardos/HackNite26/tree/archive/pre-undertone-2026-09-27), and in Git history.

Original code, sample story, and generated music: MIT (see LICENSE). Mozilla Readability 0.6.0: Apache 2.0, preserved in `extension/vendor/LICENSE.md`.

References: [Chrome popup](https://developer.chrome.com/docs/extensions/develop/ui/add-popup), [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output), [Mozilla Readability](https://github.com/mozilla/readability).
