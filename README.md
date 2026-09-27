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

Setup creates or preserves `.env` and validates the committed extension files. It does not generate a separate extension folder. A local Git clone is needed; a virtual GitHub repository in VS Code does not run the Node server. Already have a checkout? Follow **Pull updates** below.

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

Leave that terminal running. It should print `Undertone ready at http://127.0.0.1:8787`. Restart it whenever you change `.env` or server code. No runtime npm dependencies or Python installation are needed to run Undertone. Development tests use the locked dev dependencies installed by `npm ci`.

## 3. Install the extension

In Chrome on **any of the three operating systems**:

1. Open `chrome://extensions`.
2. Enable **Developer mode** at the top right.
3. Click **Load unpacked**.
4. Select the **extension** folder inside your local `HackNite26` checkout. Select the folder itself, not a ZIP or the repository root.
5. Open Chrome's extensions menu (the puzzle-piece icon) and pin **Undertone**.

Windows folder example: `C:\Users\YourName\HackNite26\extension`.
macOS/Linux folder example: your `HackNite26/extension` folder wherever you cloned it. This complete folder is committed to Git and can be loaded directly from a fresh clone.

## 4. Use the two screens

**Screen 1 — toolbar popup.** Click Undertone's pinned icon. Choose **Paste text**, paste inside that popup, then choose **Open reader**. Or choose **Scan page** on an article: Readability extracts text, and Gemini removes obvious navigation, ads, cookie notices, and other page furniture while scoring the retained text. Gemini selects original paragraphs rather than rewriting them.

**Screen 2 — full reader tab.** After the text and soundtrack score are ready, the extension opens the full reader directly. There is no home page or intermediate entry form. Press **Play** and scroll to change the music. **New text** reopens the popup when supported; otherwise click the toolbar icon again.

Text is sent to Gemini when you submit pasted text or click Scan page. The popup shows progress and errors. A missing key or unreadable page leaves the popup open so you can retry or paste manually. Pages such as `chrome://` and the Chrome Web Store cannot be scanned.

## 5. Pull updates

Save your local work and stop the running server with **Ctrl+C**, then run:

```sh
git pull --ff-only
npm run setup
npm ci
npm test
```

If your existing `.env` still selects `gemini-2.5-flash`, change that line to `GEMINI_MODEL=gemini-3.8-flash`. Setup preserves local configuration, so pulling alone will not update it. Keep your API key in `.env`; do not commit it.

**Upgrading to 1.2.1 from `dist-extension`:**

1. In `chrome://extensions`, **Remove** the old Undertone installation that was loaded from `dist-extension`.
2. Choose **Load unpacked**, select the checkout's **extension** folder, and pin Undertone again.
3. If you set the optional `EXTENSION_ID` in `.env`, replace it with the new ID shown on Undertone's Chrome extension card. Leave it empty if you have not configured this restriction.
4. Run `npm start`, close old reader tabs, and open a fresh reader from the popup.

Setup disables the legacy `dist-extension` manifest without discarding its files. That folder is retired; use **extension** from now on.

For later updates, restart the server and click **Reload** on Undertone in `chrome://extensions` after pulling. Close old reader tabs and open a fresh one. No generated build or file copy is needed.

## Audio checks

All eight committed `.wav` files in `extension/public/music/` are complete 16-second PCM audio files. They are bundled inside the extension, so playback does not fetch music from GitHub.

- In VS Code, right-click an audio file's editor tab and choose **Reopen Editor With → Audio Preview**. If using a virtual GitHub repository or a restricted preview, clone locally and open the file there.
- With the server running, open `http://127.0.0.1:8787/public/music/calm.wav` in Chrome to test the native player.
- Open `http://127.0.0.1:8787` and choose **Try sample text** for a local reader/audio check without an API key. This is a development fallback, not an extra step in the extension flow.
- If the player says it is playing but you hear nothing, check the tab/site mute control, system output device, and both volume controls. Missing files or decoding failures now give explicit messages.
- If nothing changed after pulling, confirm Chrome loaded the checkout's **extension** folder, click **Reload**, and open a fresh reader tab. Remove any old Undertone installation loaded from `dist-extension`.

## If Gemini scoring fails

Temporary service, network, and short rate-limit failures are retried automatically, up to three attempts within one minute. The popup stays open until scoring succeeds. The backend stops the request if the client disconnects. Gemini 3 text models use low thinking to reduce scoring latency.

The error now identifies the next step: update a rejected key in your local `.env`, check `GEMINI_MODEL` if the model is unavailable, or check your project's access/quota in Google AI Studio. All teammates using the same project key share its API limits. An exhausted daily quota or account restriction needs attention in AI Studio; repeated clicks cannot fix it. No account or billing settings are changed by Undertone.

The server terminal prints a short diagnostic such as `GEMINI_UNAVAILABLE` with its HTTP status, attempt number, and whether it will retry. These diagnostics contain no API keys, article text, or raw provider responses. If a failure persists, share the code and failing article URL, never your `.env`.

## Scan errors and debugging

Open the article on a regular website, then click the pinned Undertone icon and **Scan page**. Chrome settings, new-tab pages, extension pages, the Chrome Web Store and local files cannot be scanned with the current permissions. Use Paste text for PDF, image or canvas content that has no accessible page text.

Version 1.2.3 extracts directly from a cloned DOM instead of assigning article HTML back into the page. It falls back to article/main/body text if Readability cannot load or parse the page, and still sends the result through Gemini cleanup. Scripts, hidden content and editable inputs are excluded. Missing optional tab URL metadata no longer stops an otherwise authorized scan. The source page is left intact.

Failures now show a code such as `SCAN_ACCESS_DENIED`, `SCAN_PAGE_CHANGED`, `SCAN_NO_TEXT`, `SCAN_SCRIPT_FAILED`, `SERVER_UNREACHABLE`, or `GEMINI_UNAVAILABLE`. Open **Last error details → Copy debug report** in the popup. The report includes the installed extension version, failing stage, safe progress events and HTTP statuses when available; it excludes article text, URLs, keys and raw provider responses. The latest failure remains in extension session storage when the popup closes and clears after a successful reader opens.

- **Popup console:** right-click inside the popup → **Inspect** → **Console**.
- **Background console:** open `chrome://extensions`, enable Developer mode, then click **service worker** under Undertone's Inspect views.
- **Page extraction console:** open the article's DevTools with **F12 / Ctrl+Shift+J** on Windows/Linux or **⌘⌥J** on Mac. Filter for **Undertone**. If Chrome blocks injection, use the popup/background report instead. F11 controls fullscreen, not the error console.

`stage: extract` means page capture failed before Gemini. `stage: score` means extracted text reached the scoring step. `httpStatus` is the local backend response; `upstreamStatus` is Gemini's actual HTTP error, even when the local streamed response is HTTP 200. For example, upstream HTTP 503 is a temporary availability error, while HTTP 505 reports an unsupported HTTP version from the endpoint or an intermediary. Keep the exact number when sharing a report.

## Development

Run `npm ci` once after pulling dependency changes, then `npm test`. Tests use Node's built-in runner and jsdom with the real bundled Readability and serialized extraction function. GitHub Actions installs the locked dev dependencies and runs setup, tests and validation on Node 22 for Windows, macOS and Linux. `npm run build` validates the complete committed extension; it does not generate a copy. Chrome permission APIs and Gemini are mocked in CI; native toolbar testing requires Chrome, and live scoring requires an API key.

`extension/` is the complete installable extension: its root owns the popup, extraction and background handoff; `extension/reader/` owns reading, scroll tracking and Web Audio; `extension/public/music/` contains the bundled WAVs. `server/` owns Gemini and local file delivery. `shared/` owns chunking and metadata validation. Bundled WAVs and Mozilla Readability require no installation.

Scans combine paragraph selection and emotional scoring in one structured Gemini request, with bounded retries for temporary transport/service failures. The server validates paragraph IDs and reconstructs text from original paragraphs. Pasted text is scored without page cleanup. Both flows finish before a reader tab is opened. Reader sessions stay in extension session storage to support refresh; restarting Chrome clears them, and only the latest ten sessions are retained.

The backend binds to loopback, validates Host/Origin and static paths, and limits request sizes/concurrency. Keys remain server-side. A streaming JSON response starts promptly while analysis runs so the extension worker can wait for Gemini. Audio endpoints support lengths, HEAD and byte ranges for native players. Music starts with a short fade and changes moods with four-second crossfades.

`npm run music` optionally regenerates the original loops with Python 3; on Windows use `py -3 scripts/generate_music.py` if `python3` is not available. The committed files are ready to play. `launch.command` is an optional macOS shortcut; the npm commands are the supported shared workflow.

No Raspberry Pi components are included. Music is original synthesized audio, not Lyria. The sample story uses a labeled curated score. Lyria RealTime is a stretch goal.

## History and licenses

The original starter README is preserved on [archive/pre-undertone-2026-09-27](https://github.com/ItsZardos/HackNite26/tree/archive/pre-undertone-2026-09-27), and in Git history.

Original code, sample story, and generated music: MIT (see LICENSE). Mozilla Readability 0.6.0: Apache 2.0, preserved in `extension/vendor/LICENSE.md`.

References: [Chrome popup](https://developer.chrome.com/docs/extensions/develop/ui/add-popup), [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output), [Mozilla Readability](https://github.com/mozilla/readability).

Gemini reliability: [API errors and recovery](https://ai.google.dev/gemini-api/docs/generate-content/api-errors), [thinking levels and latency](https://ai.google.dev/gemini-api/docs/generate-content/thinking).

Debugging: [Chrome extension consoles](https://developer.chrome.com/docs/extensions/get-started/tutorial/debug), [DevTools shortcuts](https://developer.chrome.com/docs/devtools/shortcuts), [HTTP 505](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/505).
