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
- **Adaptive soundtrack orchestration:** Gemini's directions guide the choice of 320 original musical arrangements across 20 emotional profiles. Even tense scenes get a restrained soundtrack, and study material can get a neutral backdrop.
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
| **Import file** | Choose a PDF or DOCX inside the popup, then choose **Open reader**. |

Once your text is ready, Undertone opens the reader. Press **Play** and scroll at your own pace. The music follows your position after you pause scrolling, so it won't jump through tracks while you skim. Playback and volume controls stay in a small bar at the bottom. Click **New text** to reopen the extension menu.

## How the music is made

**Gemini chooses the musical direction. A small synthesizer in the extension makes the sound.**

The synthesizer builds tones from sine waves, layers them into slow chords and a few higher notes, then adds soft stereo echoes. It follows chord patterns and timing rules written into the code. Each variation has a fixed seed for its note choices and placement, so it sounds the same every time.

There are **320 arrangements: 16 variations across 20 mood profiles**. They share a musical foundation rather than being 320 independently written songs. Energy changes the number of notes, brightness affects their register and level, and the texture changes how they begin and fade. Sounds named felt, strings, plucks, and pads are synthesized approximations, not recordings of those instruments.

The [catalog](extension/public/music/catalog.js) stores these settings. The [synthesizer](extension/public/music/synth.js) renders **48-second stereo tracks** on your computer in a background worker. Related keys, a shared tempo, and matched levels help the tracks blend without sudden changes in volume.

Stay on a scene and another matching variation fades in around 48 seconds, avoiding the last 12 tracks. If the next one isn't ready, the current track keeps looping. The **eight bundled WAV files** are older 16-second loops made with [our Python script](scripts/generate_music.py). They serve as a fallback if the synthesizer can't run.

There are no third-party recordings or samples, and no AI music-generation service. The compositions and rendered audio are released under [CC0 1.0](extension/public/music/LICENSE.md).

To save a track as a WAV file:

```sh
npm run music:export -- quiet-focus-01
```

It goes into `music-exports/` with a copy of the license. Use `--list` to see the track IDs, or `--all` to export all 320 (about 1.4 GB). Exporting works on Windows, macOS, and Linux. Generated files stay out of Git.

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
- **No audio:** press Play, then check the reader volume, tab mute, and system output.
- **PowerShell blocks npm:** use Command Prompt or type `npm.cmd` instead of `npm`.

---

To check the project, run `npm test` and `npm run build`. Load `extension/` directly. There's no extra build folder.

[MIT license](LICENSE) · [Mozilla Readability license](extension/vendor/LICENSE.md)
