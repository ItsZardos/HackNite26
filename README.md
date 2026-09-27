<img src="extension/public/brand/monkey.png" alt="Undertone's monkey reading with headphones" width="160" height="160">

# Undertone

A Chrome extension that adds an instrumental soundtrack to what you read. Paste text, scan a webpage, or import a document. Undertone uses Gemini to match the music to the mood of each passage.

## Get started

You'll need **Google Chrome**, **Git**, and **Node.js 22.13 or newer**. The same setup works on Windows, macOS, and Linux. Each teammate runs the server on their own computer.

### 1. Set up the server

Run these commands in your terminal:

```sh
git clone https://github.com/ItsZardos/undertone.git
cd undertone
npm run setup
npm ci
```

Open the `.env` file created by setup and add your [Gemini API key](https://aistudio.google.com/apikey):

```dotenv
GEMINI_API_KEY=your_key_here
```

Leave the other settings at their defaults, then start the server:

```sh
npm start
```

Keep that terminal running while you use Undertone. Your key stays in `.env`, which Git ignores. Text you submit is sent to Gemini; imported files are parsed locally.

### 2. Load the extension

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select the repo's **extension** folder.
3. Pin Undertone from Chrome's extensions menu.

## Read with Undertone

Click the toolbar icon and choose:

- **Paste text:** paste your passage, then click **Open reader**.
- **Scan page:** read the article in your current tab. Obvious navigation and ads are filtered out.
- **Import file:** choose a **PDF or DOCX** in the import window, then click **Open reader**.

The reader opens once the text and soundtrack are ready. Press **Play**, then scroll—the music follows the passage you're reading.

To scan a local PDF or DOCX tab automatically, enable **Allow access to file URLs** under **Undertone → Details** in `chrome://extensions`. For hosted document viewers, download the file and use **Import file**.

Imports support up to **20 MB**, **100,000 characters**, and **200 pages for PDFs**. Scanned images need OCR first, protected files need an unlocked copy, and older `.doc` files must be saved as `.docx`. Complex PDF layouts may still need manual correction.

## Update

Stop the server with **Ctrl+C**, then run these commands inside your existing checkout:

```sh
git pull --ff-only
npm ci
npm start
```

Click **Reload** on Undertone in `chrome://extensions`. Open a fresh reader to use the changes; old readers keep their saved text. Your `.env` is preserved.

## If something goes wrong

- **Can't reach the server:** check that `npm start` is running. Restart it after changing `.env`.
- **Gemini errors:** run `npm run doctor` in a second terminal. It tests paste and scan scoring with sample text and uses API quota. Share the output or the popup's **Copy debug report**, never your key.
- **No sound:** press Play and check the reader volume, tab mute, and system output.
- **PowerShell blocks npm:** use Command Prompt or replace `npm` with `npm.cmd`.

## Development

Run `npm test` for the test suite and `npm run build` to validate the extension. Load `extension/` directly; there is no separate build folder to install.

[MIT license](LICENSE). Bundled Mozilla Readability is covered by its [Apache 2.0 license](extension/vendor/LICENSE.md).
