<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="assets/undertone-logo.svg?v=1.5.1">
  <source media="(prefers-color-scheme: dark)" srcset="assets/undertone-motion-dark.gif">
  <img src="assets/undertone-motion-light.gif" alt="undertone." width="1200">
</picture>

Undertone adds background music to what you're reading. Paste an article, scan a page, or import a document. Gemini identifies the mood of each passage, and the music changes as you read.

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
| **Import file** | Choose a PDF or DOCX inside the popup, then choose **Open reader**. |

Once your text is ready, Undertone opens a reader tab. Press **Play** and scroll at your own pace. The text flows continuously, and the music gently follows your position after you pause scrolling. The quiet bottom bar has playback, mood, and volume controls. To read something else, click **New text** to reopen the extension menu.

The eight ambient loops were [synthesized for Undertone](scripts/generate_music.py). Gemini chooses the mood; it does not generate the audio.

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
- **No audio:** press Play, then check the reader volume, tab mute, and system output.
- **PowerShell blocks npm:** use Command Prompt or type `npm.cmd` instead of `npm`.

---

To check the project, run `npm test` and `npm run build`. Load `extension/` directly. There's no extra build folder.

[MIT license](LICENSE) · [Mozilla Readability license](extension/vendor/LICENSE.md)
