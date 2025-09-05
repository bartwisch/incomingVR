/* eslint-disable no-console */
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const puppeteer = require('puppeteer');

const https = require('https');

async function isServerUp() {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'localhost',
        port: 8081,
        path: '/',
        method: 'GET',
        rejectUnauthorized: false,
      },
      (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      },
    );
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function startDevServer() {
  if (await isServerUp()) return null;
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'dev'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;
    const onReady = () => {
      if (!resolved) {
        resolved = true;
        resolve(child);
      }
    };

    const readyRegex = /Compiled successfully|Compiled with warnings|webpack compiled/i;
    child.stdout.on('data', (d) => {
      const s = d.toString();
      process.stdout.write(s);
      if (readyRegex.test(s)) onReady();
    });
    child.stderr.on('data', (d) => {
      const s = d.toString();
      process.stderr.write(s);
      // Some dev servers log to stderr; still detect readiness
      if (readyRegex.test(s)) onReady();
    });
    child.on('exit', (code) => {
      if (!resolved) reject(new Error(`dev server exited early with code ${code}`));
    });

    // Fallback timeout
    setTimeout(onReady, 15000);
  });
}

async function run() {
  const server = await startDevServer();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      ignoreHTTPSErrors: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--ignore-certificate-errors',
        '--use-gl=swiftshader',
        '--ignore-gpu-blocklist',
      ],
    });
    const page = await browser.newPage();
    page.on('console', (msg) => console.log('[console]', msg.text()));
    page.on('pageerror', (err) => console.error('[pageerror]', err));

    await page.goto('https://localhost:8081', {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Wait for WebGL canvas
    await page.waitForSelector('canvas', { timeout: 30000 });

    // Basic runtime checks inside the app
    const result = await page.evaluate(() => {
      const app = window.__app;
      if (!app || !app.camera) return { ok: false, error: 'no-app' };
      const { camera, scene } = app;
      const hasCrosshair = camera.children?.some(
        (c) => c.geometry && c.geometry.type === 'RingGeometry',
      );
      const hasSomeObjects = (scene.children?.length || 0) > 0;
      return { ok: hasCrosshair && hasSomeObjects, hasCrosshair, hasSomeObjects };
    });

    if (!result.ok) {
      throw new Error(
        `Smoke checks failed: crosshair=${result.hasCrosshair} objects=${result.hasSomeObjects}`,
      );
    }
    console.log('Puppeteer smoke test passed.');
  } finally {
    if (browser) await browser.close();
    // Kill dev server
    if (server && server.pid) {
      try { process.kill(server.pid); } catch {}
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
