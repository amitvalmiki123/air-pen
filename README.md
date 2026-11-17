# Air Pen ✍️

Draw glowing lines on a black canvas — in the air with a webcam, or straight on the screen with a mouse, finger, or stylus.

A projector is optional. It only makes the canvas bigger; a laptop or TV works fine.

**Live demo:** https://amitvalmiki123.github.io/air-pen/

![Setup: webcam tracks your finger, the browser draws, the projector shows it on the wall](assets/setup.jpg)

## Two ways to draw

| Mode | What moves the pen | Needs |
| --- | --- | --- |
| 🖱️ **Mouse / Touch** (default) | Mouse, trackpad, finger, or stylus | Nothing at all |
| 🎥 **Camera** | Your index fingertip, tracked by [MediaPipe Hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) | A webcam + internet for the hand model |

Air Pen opens in mouse / touch mode, so it works with no webcam and no projector. Switch to camera mode with the **Mouse / Touch** button in the top-left corner or by pressing <kbd>M</kbd>.

## Controls

| Input | Action |
| --- | --- |
| Drag (mouse / finger / stylus) | Draw |
| <kbd>Shift</kbd> (hold) + move | Draw without pressing a button — the "air pen" feel, also used by camera mode |
| <kbd>Space</kbd> | Clear |
| <kbd>F</kbd> | Fullscreen |
| <kbd>M</kbd> | Switch mouse / touch ↔ camera |
| <kbd>H</kbd> | Hide / show the interface |
| <kbd>V</kbd> | Camera preview on / off |

The toolbar fades on its own after a few seconds of drawing and comes back when you move the mouse or press a key. Press <kbd>H</kbd> to hide it completely before showing the screen to an audience.

Open with `?mode=camera` in the URL to boot straight into hand tracking.

## Run it locally

The page is static — any web server will do.

```bash
git clone https://github.com/amitvalmiki123/air-pen.git
cd air-pen
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) and start drawing.

Other options:

```bash
npx serve .            # Node
php -S localhost:8000  # PHP
```

A local server is not strictly required for mouse mode — double-clicking `index.html` also opens a working canvas. Camera mode does need `http://localhost` or `https://`, because browsers only hand out the webcam on secure origins.

## Use it on a laptop or TV (no projector)

1. Open the live link (or your local server) and press <kbd>F</kbd> for fullscreen.
2. Draw with the mouse, trackpad, or a finger on a touchscreen.
3. For a bigger canvas:
   - **TV as second screen:** plug in HDMI, set the TV to *Extend*, drag the browser window over, press <kbd>F</kbd>.
   - **Chromecast / smart TV:** open the page in Chrome and use *Cast tab*.
   - **Phone / tablet:** open the live link, rotate to landscape, draw with your finger.

## Deploy with GitHub Pages

This fork already publishes from the `main` branch root, so every push to `main` refreshes the live site.

To do the same on your own fork:

1. Push the files (`index.html`, `style.css`, `script.js`, `assets/`) to `main`.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*, branch **`main`**, folder **`/ (root)`**, then **Save**.
4. Wait ~1 minute; the site appears at `https://<username>.github.io/air-pen/`.

Or from the command line, with the [GitHub CLI](https://cli.github.com/):

```bash
gh api -X POST repos/<username>/air-pen/pages \
  -f 'source[branch]=main' -f 'source[path]=/'
```

## Troubleshooting

- **"Camera unavailable" message** — no webcam, permission denied, or the page is not on `https` / `localhost`. Mouse and touch mode keep working.
- **Camera button does nothing and the browser tab spins** — hand tracking is downloaded from jsDelivr on first use; check the connection.
- **Drawing is offset or inverted** — mouse mode is 1:1 with the screen, camera mode is mirrored like a mirror. Switching modes resets the mirroring automatically.
- **Lines look soft / thick on a TV** — that is the glow effect; it is intentional. Use fullscreen for the crispest result.

## Credits

Original project: [gprem09/air-pen](https://github.com/gprem09/air-pen). Hand tracking by [MediaPipe Hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker).
