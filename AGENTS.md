# Repository Guidelines

## Project Structure & Module Organization
- `src/`: App code. Entry `index.js`, emulator setup `init.js`, HTML `index.html`, and assets in `src/assets/` (GLB, OGG, TTF). Assets are copied to `dist/assets/` by Webpack.
- `tutorial/`: Step-by-step chapters and images used by the README.
- Tooling: `webpack.config.cjs`, `eslint.config.cjs`, `prettier.config.cjs`. GitHub Pages deploy workflow in `.github/`.

## Build, Test, and Development Commands
- `npm install`: Install dependencies (Node 20.x, npm 10.x recommended).
- `npm run dev`: Start HTTPS dev server at `https://localhost:8081` (also accessible on LAN; accept self-signed cert). ESLint runs via Webpack.
- `npm run build`: Produce production bundle in `dist/`.
- `npm run format`: Format source files with Prettier.

Manual test checklist:
- Load scene, enter VR, shoot targets, see score update, hear sounds, and feel haptics. Verify controller models and emulation fallback (`init.js`) work when WebXR is unavailable.

## Coding Style & Naming Conventions
- JavaScript (ES modules). Indent with tabs; LF line endings.
- Quotes: single; trailing commas; `arrowParens: always` (see `prettier.config.cjs`).
- Imports: sorted (`sort-imports`), unused vars warned (prefix `_` to ignore), blank lines between class members (see `eslint.config.cjs`).
- File names: kebab-case for JS/HTML (e.g., `index.js`, `init.js`); lower-case, dash-separated asset names in `src/assets/`.

## Testing Guidelines
- No formal test suite. Prefer manual verification locally (`npm run dev`) and on-device (Quest browser). Emulation via IWER is auto-enabled in `init.js` when native WebXR is unavailable.
- If adding tests, colocate under `src/` and document how to run them in the PR.

## Commit & Pull Request Guidelines
- Commits: short, imperative subject (e.g., "use https for webxr"); keep focused.
- PRs must include: concise description, linked issues, before/after screenshots or short GIF for UX changes, steps to reproduce/test, and notes on assets added/updated.
- Ensure `npm run format` is clean and app runs (`npm run dev`) before requesting review.

## Security & Configuration Tips
- Dev server uses HTTPS; accept the local certificate. To test on headset, open the LAN URL from the dev server output or use ADB port forwarding to `8081`.
- Place new static assets in `src/assets/`; optimize GLB/OGG to keep bundle sizes reasonable.
