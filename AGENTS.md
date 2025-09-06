# Repository Guidelines

## Project Structure & Module Organization
- `src/`: ES‑module app. Entry `index.js`; WebXR/IWER bootstrap `init.js`; HTML `index.html`.
- `src/assets/`: GLB, OGG, TTF. Copied to `dist/assets/` by Webpack.
- `dist/`: Build output (generated).
- `tutorial/`: Chapters and images used by the README.
- Tooling: `webpack.config.cjs`, `eslint.config.cjs`, `prettier.config.cjs`; GitHub Pages workflow in `.github/`.

## Build, Test, and Development Commands
- `npm install` — install dependencies (Node 20.x, npm 10.x recommended).
- `npm run dev` — HTTPS dev server at `https://localhost:8081` (also on LAN; accept the self‑signed cert). ESLint runs during build.
- `npm run build` — create production bundle in `dist/`.
- `npm run format` — Prettier formatting for `src/**/*`.
- `npm run test:puppeteer` — optional smoke test that loads the page and checks basic UI.

## Coding Style & Naming Conventions
- Language: JavaScript ES modules; tabs for indentation; LF line endings.
- Prettier: single quotes, trailing commas, `arrowParens: always`.
- ESLint: import sorting, unused‑var warnings (prefix `_` to ignore), blank lines between class members.
- Filenames: kebab‑case for multi‑word JS/HTML (e.g., `target-manager.js`); assets lower‑case‑dash in `src/assets/`.

## Testing Guidelines
- No formal test suite; prefer manual verification locally (`npm run dev`) and on‑device (Quest browser).
- Verify: scene loads, enter VR, shoot targets, score updates, audio + haptics play; controller models appear; IWER emulation in `init.js` works when WebXR is unavailable.
- If adding tests, colocate under `src/` and document how to run them in the PR.

## Commit & Pull Request Guidelines
- Commits: short, imperative subject (e.g., "use https for webxr"); keep changes focused.
- PRs must include: concise description, linked issues, before/after screenshots or a short GIF for UX changes, steps to reproduce/test, and notes on added/updated assets.
- Ensure formatting passes and the app runs (`npm run dev`) before requesting review.

## Security & Configuration Tips
- Dev server uses HTTPS; accept the local certificate. For headset testing, open the LAN URL from the dev server output or use ADB port‑forwarding to `8081`.
- Place new static assets in `src/assets/`; optimize GLB/OGG to keep bundle sizes reasonable.
