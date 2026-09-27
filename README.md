<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="assets/undertone-logo.svg?v=1.6.0">
  <source media="(prefers-color-scheme: dark)" srcset="assets/undertone-motion-dark.gif?v=1.6.0">
  <img src="assets/undertone-motion-light.gif?v=1.6.0" alt="undertone." width="1200">
</picture>

Undertone uses the **Gemini API** to match quiet background music to what you're reading. Paste a passage, scan a webpage, or import a PDF or Word document from the extension. The soundtrack changes as you read, whether you're following a story or working through something for class.

## Built around Gemini

Gemini makes the decisions behind the soundtrack. A character can be happy about leaving home and scared at the same time. We want the music to pick up on both, which takes more than spotting a few emotion words.

- **Context-aware scene understanding:** Gemini reads the supplied passages together to follow the emotional arc. What happened earlier can change how the next scene feels.
- **Multidimensional emotion analysis:** We ask for primary and secondary moods, a scene profile, energy, brightness, tension, and a sound texture. These give us room for mixed feelings like nervous excitement, bittersweet nostalgia, and cautious optimism.
- **Structured outputs:** Gemini returns JSON constrained by a response schema. The server checks section IDs, allowed values, and numeric ranges before those directions reach the reader.
- **AI-assisted page cleanup:** When you scan a webpage, Gemini selects which extracted paragraphs belong to the article. Menus and cookie notices can go; the paragraphs we keep stay in the author's words.
- **Adaptive soundtrack orchestration:** Gemini's directions guide the choice of 45 CC0 demo recordings across 20 emotional profiles. Even tense scenes get a restrained soundtrack, and study material can get a neutral backdrop.
- **Resilient API integration:** Keys stay on the local server. We use bounded retries and model fallback for temporary failures. If scoring still fails, the popup explains the problem instead of quietly making up a result.

Every new reading relies on Gemini to prepare its soundtrack before the reader opens. After that, playback follows your reading position locally. You can scroll freely without making another API request each time you move down the page.

## Run the demo

You'll need **Chrome**, **Git**, **Node.js 22.13 or newer**, and a [Gemini API key](https://aistudio.google.com/apikey). Works on Windows, macOS, and Linux.

### 1. Start the server

```sh
git clone https://github.com/ItsZardos/undertone.git
cd undertone
npm run setup
npm ci
```

Open the `.env` file that setup creates and paste your key:

```dotenv
GEMINI_API_KEY=your_key_here
```

You can leave the other settings at their defaults. Start the server with:

```sh
npm start
```

Keep that terminal open during the demo. Your key stays in `.env`, which Git ignores.

### 2. Add Undertone to Chrome

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select the repo's **extension** folder.
3. Pin Undertone from Chrome's extensions menu.

Click the monkey in your toolbar to begin. There's no separate website to open.

## Try the reader

| In the extension menu | What to do |
| --- | --- |
| **Paste text** | Paste your passage, then choose **Open reader**. |
| **Scan page** | Extract the article from the current tab. Navigation and other page clutter are filtered out. |
| **Import file** | Choose a PDF or DOCX, review the extracted text, then choose **Open reader**. |

Drafts stay in the popup for the current browser session. If you close the menu while a file or soundtrack is being prepared, reopen it to see the progress.

Once your text is ready, Undertone opens the reader. Music starts automatically. Press **Space** or use the player to pause and resume, and scroll at your own pace. Each scroll settles on one page of text, so the soundtrack belongs to the passage you can actually see. Long passages span several pages without switching music. Pages adjust to your window, and a small counter keeps your place. You can also use the arrow keys or Page Up and Page Down. Playback and volume controls stay in a small bar at the bottom. To start another reading, open Undertone from your browser toolbar.

## About the music

**Gemini chooses the soundtrack. The music itself comes from 45 distinct CC0 recordings.**

The demo includes piano, ambient, acoustic, and light orchestral pieces from several creators, including The Cynic Project, Juhani Junkala, Komiku, and others listed in the [music credits](extension/public/music/CREDITS.md). These are different pieces of music, rather than hundreds of variations from one synthesizer.

The actual MP3 files are in [extension/public/music/recordings](extension/public/music/recordings), about **39 MB** in total. They come with the repo and play locally, so you don't need a music account, a download script, or paid generation. Gemini still needs an API connection to analyze a new reading.

These are **demo clips, roughly 22–58 seconds each**, rather than the full original songs. We kept the original tempo and pitch, matched their loudness, and softened the loop joins. The player changes to another suitable recording after roughly 45–55 seconds, or when you move into a different passage. Short clips loop in the meantime, and the current music keeps playing while the next file loads.

Every recording has a source link and artist credit. The source files and our edits are documented in [sources.json](extension/public/music/sources.json), with the [license details here](extension/public/music/LICENSE.md). The eight older WAV loops remain as a fallback if a recording fails to load. The previous 320 procedural variations are no longer the playback catalog.

## Where we'd take it next

We'd move the music library to online storage with an API for the catalog and track URLs. That would let us add more music without making people download a larger extension each time. For this demo, the audio stays bundled in GitHub so a fresh clone has everything needed to play it.

## Documents and privacy

Files are parsed locally; extracted text is sent to Gemini. Imports support **20 MB**, **100,000 characters**, and **200 PDF pages**. Image-only PDFs need OCR first; older `.doc` files need to be saved as `.docx`. Complex PDF layouts may need a quick check.

To scan a local PDF or DOCX tab, enable **Allow access to file URLs** in Undertone's extension details. For online document viewers, download the file and use **Import file**.

## Stay up to date

Stop the server with **Ctrl+C**, then run this inside your checkout:

```sh
git pull --ff-only
npm ci
npm start
```

Click **Reload** on Undertone in `chrome://extensions`. Open a new reader to see the changes. Your `.env` stays intact.

## If something gets stuck

- **Server unavailable:** check that `npm start` is running. Restart after changing `.env`.
- **Gemini error:** run `npm run doctor` in a second terminal. It makes test API requests and uses quota. Share its output or **Copy debug report** from the popup, never your key.
- **No audio:** if your browser blocks autoplay, press **Space** or **Play**. Then check the reader volume, tab mute, and system output.
- **PowerShell blocks npm:** use Command Prompt or type `npm.cmd` instead of `npm`.

---

To check the project, run `npm test` and `npm run build`. Load `extension/` directly. There's no extra build folder.

[MIT license](LICENSE) · [Mozilla Readability license](extension/vendor/LICENSE.md)
