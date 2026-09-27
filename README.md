<img src="assets/undertone-wordmark.svg" alt="undertone." width="1200">

Undertone gives what you read an instrumental soundtrack. Gemini identifies the mood of each passage, and the music changes as you scroll—from a quiet opening to a tense moment or a hopeful ending.

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

Leave the other settings as they are, then run:

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

The reader opens only when your text and soundtrack are ready. Press **Play** and scroll between passages to hear the mood change. The bottom bar shows the current mood and lets you jump between sections. **New text** opens the extension menu again.

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

To verify the project, run `npm test` and `npm run build`. Load `extension/` directly—there's no second build folder.

[MIT license](LICENSE) · [Mozilla Readability license](extension/vendor/LICENSE.md)
