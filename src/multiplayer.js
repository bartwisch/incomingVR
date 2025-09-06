import * as THREE from 'three';
import { Text } from 'troika-three-text';

// Minimal realtime multiplayer client
// - Connects to same-origin WSS endpoint at /players
// - Sends local player transform ~20Hz
// - Renders remote players with colored body + name label

const remotePlayers = new Map(); // id -> { group, label }
let socket = null;
let world = { scene: null, player: null };
let lastSend = 0;
const SEND_HZ = 20;
const SEND_MS = 1000 / SEND_HZ;

function wsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/players`;
}

function makeAvatar(name, color = 0x888888) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.6, 0.3),
    new THREE.MeshStandardMaterial({ color })
  );
  body.position.set(0, 0.9, 0);
  group.add(body);

  const label = new Text();
  label.text = name;
  label.fontSize = 0.1;
  label.color = 0xffffff;
  label.anchorX = 'center';
  label.anchorY = 'bottom';
  label.position.set(0, 1.25, 0);
  label.material.depthTest = false;
  label.material.depthWrite = false;
  label.renderOrder = 1000;
  group.add(label);
  label.sync();
  return { group, label };
}

function onMessage(msg) {
  switch (msg.type) {
    case 'welcome': {
      console.log('[mp] welcome', (msg.players || []).length, 'existing players');
      // Create avatars for existing players
      (msg.players || []).forEach((p) => {
        if (!remotePlayers.has(p.id)) {
          const avatar = makeAvatar(p.name, p.color);
          avatar.group.position.set(p.state?.p?.[0] ?? 0, p.state?.p?.[1] ?? 0, p.state?.p?.[2] ?? 0);
          avatar.group.rotation.set(
            p.state?.r?.[0] ?? 0,
            p.state?.r?.[1] ?? 0,
            p.state?.r?.[2] ?? 0
          );
          world.scene.add(avatar.group);
          remotePlayers.set(p.id, avatar);
        }
      });
      break; }
    case 'join': {
      console.log('[mp] join', msg?.player?.id || 'unknown');
      const p = msg.player;
      if (p && !remotePlayers.has(p.id)) {
        const avatar = makeAvatar(p.name, p.color);
        world.scene.add(avatar.group);
        remotePlayers.set(p.id, avatar);
      }
      break; }
    case 'state': {
      const avatar = remotePlayers.get(msg.id);
      if (avatar) {
        const s = msg.state || {};
        if (Array.isArray(s.p)) avatar.group.position.set(s.p[0] ?? 0, s.p[1] ?? 0, s.p[2] ?? 0);
        if (Array.isArray(s.r)) avatar.group.rotation.set(s.r[0] ?? 0, s.r[1] ?? 0, s.r[2] ?? 0);
      }
      break; }
    case 'leave': {
      console.log('[mp] leave', msg?.id);
      const avatar = remotePlayers.get(msg.id);
      if (avatar) {
        world.scene.remove(avatar.group);
        remotePlayers.delete(msg.id);
      }
      break; }
    default:
      break;
  }
}

export function initMultiplayer(scene, _camera, player) {
  world.scene = scene;
  world.player = player;
  try { socket && socket.close(); } catch {}
  socket = new WebSocket(wsUrl());
  socket.onopen = () => { console.log('[mp] open'); };
  socket.onmessage = (ev) => {
    try { onMessage(JSON.parse(ev.data)); } catch {}
  };
  socket.onerror = (e) => { console.error('[mp] error', e?.message || e); };
  socket.onclose = () => {
    // cleanup remotes on disconnect
    for (const { group } of remotePlayers.values()) world.scene.remove(group);
    remotePlayers.clear();
  };
}

export function tickMultiplayer(timeMs) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  if (!world.player) return;
  if (timeMs - lastSend < SEND_MS) return;
  lastSend = timeMs;
  const p = world.player.position;
  const r = world.player.rotation;
  const msg = { type: 'state', p: [p.x, p.y, p.z], r: [r.x, r.y, r.z] };
  try { socket.send(JSON.stringify(msg)); } catch {}
}

export function getPlayerCount() {
  // remote + local self (approx.)
  return remotePlayers.size + 1;
}

// Test helper for introspection in headless runs
export function __debugPlayerCount() {
  return remotePlayers.size + 1;
}
