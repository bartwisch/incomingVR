/* eslint-disable no-console */
'use strict';

const { spawn } = require('child_process');
const https = require('https');
const puppeteer = require('puppeteer');

async function isServerUp() {
  return new Promise((resolve) => {
    const req = https.request(
      { hostname: 'localhost', port: 8081, path: '/', method: 'GET', rejectUnauthorized: false },
      (res) => resolve(res.statusCode >= 200 && res.statusCode < 500),
    );
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function startDevServer() {
  if (await isServerUp()) return null;
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'dev'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let resolved = false;
    const readyRegex = /Compiled successfully|Compiled with warnings|webpack compiled/i;
    const onReady = () => { if (!resolved) { resolved = true; resolve(child); } };
    child.stdout.on('data', (d) => { const s = d.toString(); process.stdout.write(s); if (readyRegex.test(s)) onReady(); });
    child.stderr.on('data', (d) => { const s = d.toString(); process.stderr.write(s); if (readyRegex.test(s)) onReady(); });
    child.on('exit', (code) => { if (!resolved) reject(new Error(`dev server exited early: ${code}`)); });
    setTimeout(onReady, 15000);
  });
}

async function playersText(page) {
  return page.evaluate(() => {
    const app = window.__app;
    if (!app?.camera) return null;
    const find = (obj) => {
      if (obj && typeof obj.text === 'string' && obj.text.startsWith('Players:')) return obj.text;
      if (!obj?.children) return null;
      for (const c of obj.children) { const t = find(c); if (t) return t; }
      return null;
    };
    return find(app.camera) || null;
  });
}

async function run() {
  const server = await startDevServer();
  const browser = await puppeteer.launch({
    headless: 'new',
    ignoreHTTPSErrors: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--ignore-certificate-errors',
      '--enable-webgl',
    ],
  });
  try {
    const [p1, p2] = await Promise.all([browser.newPage(), browser.newPage()]);
    await Promise.all([
      p1.goto('https://localhost:8081', { waitUntil: 'load', timeout: 120000 }),
      p2.goto('https://localhost:8081', { waitUntil: 'load', timeout: 120000 }),
    ]);
    // Give the WS handshake a moment
    await new Promise((r) => setTimeout(r, 1500));
    const [t1, t2] = await Promise.all([playersText(p1), playersText(p2)]);
    console.log('[p1]', t1);
    console.log('[p2]', t2);
    if (t1 !== 'Players: 2' || t2 !== 'Players: 2') {
      throw new Error(`Expected both tabs to show Players: 2 (got '${t1}' / '${t2}')`);
    }
    console.log('Two-tab multiplayer smoke passed.');
  } finally {
    await browser.close();
    if (server && server.pid) { try { process.kill(server.pid); } catch {} }
  }
}

run().catch((e) => { console.error(e); process.exit(1); });

