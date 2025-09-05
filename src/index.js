/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';
import { XR_AXES, XR_BUTTONS } from 'gamepad-wrapper';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Text } from 'troika-three-text';
import { init } from './init.js';

let unlockText = null;
let tankPivot = null;
let turretPivot = null;
let prevHandsAngle = null;
let prevHandsMidFwd = null;
let tankPosText = null;
let tankRotText = null;
let playerPosText = null;

// Shooting state
let bulletGroup = null;
let bulletGeo = null;
let bulletMat = null;
const bullets = [];
let audioListener = null;
let shotBuffer = null;

function setupScene({ scene, camera, renderer: _renderer, player: _player, controllers: _controllers }) {
  const loader = new GLTFLoader();
  loader.load('assets/tank1.glb', (gltf) => {
    const tank = gltf.scene;

    // Place tank pivot at world origin (0,0,0)
    const targetPos = new THREE.Vector3(0, 0, 0);

    // Create pivot at target position and center the tank inside it
    tankPivot = new THREE.Group();
    tankPivot.position.copy(targetPos);
    scene.add(tankPivot);
    // Turret pivot to allow pitch around X, nested under the main pivot
    turretPivot = new THREE.Group();
    tankPivot.add(turretPivot);
    turretPivot.add(tank);

    // Center tank geometry around pivot origin so rotation happens around its middle
    const worldCenter = new THREE.Vector3();
    new THREE.Box3().setFromObject(tank).getCenter(worldCenter);
    tankPivot.worldToLocal(worldCenter);
    tank.position.sub(worldCenter);

    // Base orientation of the model
    tank.rotation.y = (Math.PI / 2) + Math.PI; // rotate 270° total (90° + 180°)

    // Keep reference only to pivot; tank is child of pivot

    // Show large axes at the tank pivot
    const axes = new THREE.AxesHelper(3);
    tankPivot.add(axes);

    // Axis labels (X, Y, Z) at tank pivot
    const labelX = new Text();
    labelX.text = 'X';
    labelX.fontSize = 0.2;
    labelX.color = 0xff4444;
    labelX.position.set(3.3, 0, 0);
    labelX.anchorX = 'center';
    labelX.anchorY = 'middle';
    labelX.renderOrder = 1000;
    labelX.material.depthTest = false;
    labelX.material.depthWrite = false;
    tankPivot.add(labelX);
    labelX.sync();

    const labelY = new Text();
    labelY.text = 'Y';
    labelY.fontSize = 0.2;
    labelY.color = 0x44ff44;
    labelY.position.set(0, 3.3, 0);
    labelY.anchorX = 'center';
    labelY.anchorY = 'middle';
    labelY.renderOrder = 1000;
    labelY.material.depthTest = false;
    labelY.material.depthWrite = false;
    tankPivot.add(labelY);
    labelY.sync();

    const labelZ = new Text();
    labelZ.text = 'Z';
    labelZ.fontSize = 0.2;
    labelZ.color = 0x4488ff;
    labelZ.position.set(0, 0, 3.3);
    labelZ.anchorX = 'center';
    labelZ.anchorY = 'middle';
    labelZ.renderOrder = 1000;
    labelZ.material.depthTest = false;
    labelZ.material.depthWrite = false;
    tankPivot.add(labelZ);
    labelZ.sync();
  });

  // HUD text for unlock indicator (hidden by default)
  unlockText = new Text();
  unlockText.text = 'UNLOCK';
  unlockText.fontSize = 0.1;
  unlockText.color = 0x00ff7f;
  unlockText.anchorX = 'center';
  unlockText.anchorY = 'top';
  unlockText.position.set(0, 0.45, -1.2);
  unlockText.renderOrder = 1000;
  unlockText.material.depthTest = false;
  unlockText.material.depthWrite = false;
  unlockText.visible = false;
  camera.add(unlockText);

  // World reference: origin axes + ground grid
  const worldAxes = new THREE.AxesHelper(2);
  scene.add(worldAxes);
  const grid = new THREE.GridHelper(40, 40, 0x444444, 0x222222);
  scene.add(grid);

  // World axis numeric labels along X and Z (every 2 units)
  const labelMaterialOpts = { depthTest: false, depthWrite: false };
  const mkLabel = (text, pos, color = 0xffffff, size = 0.06, anchorX = 'center', anchorY = 'middle') => {
    const t = new Text();
    t.text = text;
    t.fontSize = size;
    t.color = color;
    t.anchorX = anchorX;
    t.anchorY = anchorY;
    t.position.copy(pos);
    t.renderOrder = 1000;
    t.material.depthTest = labelMaterialOpts.depthTest;
    t.material.depthWrite = labelMaterialOpts.depthWrite;
    scene.add(t);
    t.sync();
    return t;
  };
  // X axis labels
  for (let i = -20; i <= 20; i += 2) {
    const pos = new THREE.Vector3(i, 0.02, 0);
    mkLabel(`${i}`, pos, 0xff6666, 0.05, 'center', 'top');
  }
  // Z axis labels
  for (let k = -20; k <= 20; k += 2) {
    const pos = new THREE.Vector3(0, 0.02, k);
    mkLabel(`${k}`, pos, 0x6688ff, 0.05, 'left', 'middle');
  }

  // HUD: display tank world position
  tankPosText = new Text();
  tankPosText.text = 'Tank: x=0.00 y=0.00 z=0.00';
  tankPosText.fontSize = 0.06;
  tankPosText.color = 0xffffff;
  tankPosText.anchorX = 'left';
  tankPosText.anchorY = 'top';
  tankPosText.position.set(-0.6, 0.55, -1.2);
  tankPosText.renderOrder = 1000;
  tankPosText.material.depthTest = false;
  tankPosText.material.depthWrite = false;
  camera.add(tankPosText);

  // HUD: display tank rotation (yaw/pitch/roll in degrees)
  tankRotText = new Text();
  tankRotText.text = 'Rot: yaw=0 pitch=0 roll=0';
  tankRotText.fontSize = 0.06;
  tankRotText.color = 0xffffff;
  tankRotText.anchorX = 'left';
  tankRotText.anchorY = 'top';
  tankRotText.position.set(-0.6, 0.49, -1.2);
  tankRotText.renderOrder = 1000;
  tankRotText.material.depthTest = false;
  tankRotText.material.depthWrite = false;
  camera.add(tankRotText);

  // HUD: display player world position
  playerPosText = new Text();
  playerPosText.text = 'Player: x=0.00 y=0.00 z=0.00';
  playerPosText.fontSize = 0.06;
  playerPosText.color = 0xffffff;
  playerPosText.anchorX = 'left';
  playerPosText.anchorY = 'top';
  playerPosText.position.set(-0.6, 0.43, -1.2);
  playerPosText.renderOrder = 1000;
  playerPosText.material.depthTest = false;
  playerPosText.material.depthWrite = false;
  camera.add(playerPosText);

  // Bullet prototype/shared
  bulletGeo = new THREE.SphereGeometry(0.05, 16, 12);
  bulletMat = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
  bulletGroup = new THREE.Group();
  scene.add(bulletGroup);

  // Audio: listener + load shot buffer (prefer shot1.mp3 with fallbacks)
  audioListener = new THREE.AudioListener();
  camera.add(audioListener);
  const audioLoader = new THREE.AudioLoader();
  const tryLoad = (url, next) => {
    audioLoader.load(
      url,
      (buffer) => {
        shotBuffer = buffer;
      },
      undefined,
      () => {
        if (next) next();
      },
    );
  };
  tryLoad('assets/shot1.mp3', () =>
    tryLoad('assets/big_caliber_gunshot-1757083126996.mp3', () =>
      tryLoad('assets/laser.ogg'),
    ),
  );
}

const DEADZONE = 0.15;
const PLAYER_MOVE_SPEED = 2.0; // m/s for left-stick locomotion
const PLAYER_ELEVATE_SPEED = 1.5; // m/s for right-stick vertical movement
const TURRET_PITCH_SPEED = 6.0; // rad per meter pulled towards self (3x sensitivity)
const TURRET_PITCH_MIN = -Math.PI / 4; // -45 deg
const TURRET_PITCH_MAX = Math.PI / 4; // +45 deg
const BULLET_SPEED = 10; // m/s
const BULLET_TTL = 2.0; // seconds
const FIRE_RATE = 3; // per second when both triggers held
let fireTimer = 0;

function onFrame(delta, _time, { controllers, camera, player }) {
  // Determine unlock state (both squeezes held)
  const leftHeld = !!(controllers.left && controllers.left.gamepad && (
    (typeof controllers.left.gamepad.getButton === 'function' && controllers.left.gamepad.getButton(XR_BUTTONS.SQUEEZE)) ||
    (typeof controllers.left.gamepad.getButtonPressed === 'function' && controllers.left.gamepad.getButtonPressed(XR_BUTTONS.SQUEEZE)) ||
    (controllers.left.gamepad.gamepad && controllers.left.gamepad.gamepad.buttons && controllers.left.gamepad.gamepad.buttons[1]?.pressed)
  ));
  const rightHeld = !!(controllers.right && controllers.right.gamepad && (
    (typeof controllers.right.gamepad.getButton === 'function' && controllers.right.gamepad.getButton(XR_BUTTONS.SQUEEZE)) ||
    (typeof controllers.right.gamepad.getButtonPressed === 'function' && controllers.right.gamepad.getButtonPressed(XR_BUTTONS.SQUEEZE)) ||
    (controllers.right.gamepad.gamepad && controllers.right.gamepad.gamepad.buttons && controllers.right.gamepad.gamepad.buttons[1]?.pressed)
  ));
  const bothHeld = leftHeld && rightHeld;

  if (unlockText) {
    unlockText.visible = bothHeld;
    if (unlockText.visible) unlockText.sync();
  }

  // Update tank position HUD
  if (tankPosText && tankPivot) {
    const p = new THREE.Vector3();
    tankPivot.getWorldPosition(p);
    tankPosText.text = `Tank: x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} z=${p.z.toFixed(2)}`;
    tankPosText.sync();
  }

  // Update tank rotation HUD (yaw from tankPivot, pitch from turretPivot, roll from turretPivot)
  if (tankRotText && tankPivot && turretPivot) {
    const yawDeg = THREE.MathUtils.radToDeg(tankPivot.rotation.y);
    const pitchDeg = THREE.MathUtils.radToDeg(turretPivot.rotation.x);
    const rollDeg = THREE.MathUtils.radToDeg(turretPivot.rotation.z);
    tankRotText.text = `Rot: yaw=${yawDeg.toFixed(0)}° pitch=${pitchDeg.toFixed(0)}° roll=${rollDeg.toFixed(0)}°`;
    tankRotText.sync();
  }

  // Update player position HUD
  if (playerPosText && player) {
    const p = new THREE.Vector3();
    player.getWorldPosition(p);
    playerPosText.text = `Player: x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} z=${p.z.toFixed(2)}`;
    playerPosText.sync();
  }

  if (controllers.left && player && camera) {
    // Left thumbstick: locomotion on XZ plane (forward/back + strafe)
    const gp = controllers.left.gamepad;
    let lx = 0;
    let ly = 0;
    if (gp && typeof gp.getAxis === 'function') {
      try { lx = gp.getAxis(XR_AXES.THUMBSTICK_X) ?? 0; } catch { lx = 0; }
      try { ly = gp.getAxis(XR_AXES.THUMBSTICK_Y) ?? 0; } catch { ly = 0; }
    } else if (gp && gp.gamepad && Array.isArray(gp.gamepad.axes)) {
      lx = gp.gamepad.axes[2] ?? 0;
      ly = gp.gamepad.axes[3] ?? 0;
    }
    if (Math.abs(lx) > DEADZONE || Math.abs(ly) > DEADZONE) {
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      fwd.y = 0; fwd.normalize();
      const right = new THREE.Vector3();
      right.crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      const move = new THREE.Vector3();
      move.addScaledVector(fwd, -ly);
      move.addScaledVector(right, lx);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(PLAYER_MOVE_SPEED * delta);
        player.position.add(move);
      }
    }
  }

  // Two-hand rotation when unlocked
  if (bothHeld && controllers.left && controllers.right && tankPivot) {
    const lp = new THREE.Vector3();
    const rp = new THREE.Vector3();
    controllers.left.gripSpace.getWorldPosition(lp);
    controllers.right.gripSpace.getWorldPosition(rp);
    // Compute heading angles on XZ plane
    const v = rp.clone().sub(lp);
    v.y = 0;
    if (v.lengthSq() > 1e-6) {
      const angle = Math.atan2(v.x, v.z);
      if (prevHandsAngle == null) {
        prevHandsAngle = angle;
      } else {
        let deltaAngle = angle - prevHandsAngle;
        // wrap to [-PI, PI]
        if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
        if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
        tankPivot.rotation.y += deltaAngle;
        prevHandsAngle = angle;
      }
    }

    // Turret pitch: use midpoint movement along CAMERA forward
    // This makes pitch relative to HMD, reducing unintended motion from head translation.
    const mid = lp.clone().add(rp).multiplyScalar(0.5);
    const camFwd = new THREE.Vector3();
    camera.getWorldDirection(camFwd);
    camFwd.normalize();
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    const s = mid.sub(camPos).dot(camFwd); // signed forward distance from camera
    if (prevHandsMidFwd == null) {
      prevHandsMidFwd = s;
    } else if (turretPivot) {
      let deltaS = s - prevHandsMidFwd; // pulling towards self => deltaS negative
      // Inverted pitch: pull (deltaS<0) lowers turret (negative X rotation)
      turretPivot.rotation.x += (deltaS) * TURRET_PITCH_SPEED;
      // Clamp pitch
      if (turretPivot.rotation.x > TURRET_PITCH_MAX) turretPivot.rotation.x = TURRET_PITCH_MAX;
      if (turretPivot.rotation.x < TURRET_PITCH_MIN) turretPivot.rotation.x = TURRET_PITCH_MIN;
      prevHandsMidFwd = s;
    }
  } else {
    // reset tracking when not both held
    prevHandsAngle = null;
    prevHandsMidFwd = null;
  }

  // In LOCK mode, do not rotate the tank/turret by hand gestures.

  // Right thumbstick: change player height (Y position)
  if (controllers.right && player) {
    const gp = controllers.right.gamepad;
    let ry = 0;
    if (gp && typeof gp.getAxis === 'function') {
      try { ry = gp.getAxis(XR_AXES.THUMBSTICK_Y) ?? 0; } catch { ry = 0; }
    } else if (gp && gp.gamepad && Array.isArray(gp.gamepad.axes)) {
      ry = gp.gamepad.axes[3] ?? 0;
    }
    if (Math.abs(ry) > DEADZONE) {
      // Up on stick (-1) -> move up (+Y)
      player.position.y += (-ry) * PLAYER_ELEVATE_SPEED * delta;
    }
  }

  // Firing: both triggers held => shoot balls from turret at fixed rate
  const leftTriggerDown = !!(controllers.left && controllers.left.gamepad && (
    (typeof controllers.left.gamepad.getButton === 'function' && controllers.left.gamepad.getButton(XR_BUTTONS.TRIGGER)) ||
    (typeof controllers.left.gamepad.getButtonPressed === 'function' && controllers.left.gamepad.getButtonPressed(XR_BUTTONS.TRIGGER)) ||
    (controllers.left.gamepad.gamepad && controllers.left.gamepad.gamepad.buttons && controllers.left.gamepad.gamepad.buttons[0]?.pressed)
  ));
  const rightTriggerDown = !!(controllers.right && controllers.right.gamepad && (
    (typeof controllers.right.gamepad.getButton === 'function' && controllers.right.gamepad.getButton(XR_BUTTONS.TRIGGER)) ||
    (typeof controllers.right.gamepad.getButtonPressed === 'function' && controllers.right.gamepad.getButtonPressed(XR_BUTTONS.TRIGGER)) ||
    (controllers.right.gamepad.gamepad && controllers.right.gamepad.gamepad.buttons && controllers.right.gamepad.gamepad.buttons[0]?.pressed)
  ));
  const bothTriggers = leftTriggerDown && rightTriggerDown;

  if (bothTriggers && turretPivot && bulletGeo && bulletMat && bulletGroup) {
    fireTimer += delta;
    const interval = 1 / FIRE_RATE;
    while (fireTimer >= interval) {
      fireTimer -= interval;
      const q = new THREE.Quaternion();
      turretPivot.getWorldQuaternion(q);
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize();
      const start = new THREE.Vector3();
      turretPivot.getWorldPosition(start);
      start.addScaledVector(dir, 1.0);
      const mesh = new THREE.Mesh(bulletGeo, bulletMat);
      mesh.position.copy(start);
      mesh.quaternion.copy(q);
      mesh.userData = {
        vel: dir.clone().multiplyScalar(BULLET_SPEED),
        ttl: BULLET_TTL,
      };
      // Play shot audio at the muzzle/bullet origin
      if (shotBuffer && audioListener) {
        const shot = new THREE.PositionalAudio(audioListener);
        shot.setBuffer(shotBuffer);
        shot.setRefDistance(2);
        shot.setVolume(0.6);
        mesh.add(shot);
        shot.play();
      }
      bulletGroup.add(mesh);
      bullets.push(mesh);
    }
  } else {
    // reset cooldown if triggers released
    fireTimer = 0;
  }

  // Update bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.userData.ttl -= delta;
    if (b.userData.ttl <= 0) {
      bulletGroup.remove(b);
      bullets.splice(i, 1);
      continue;
    }
    const deltaMove = b.userData.vel.clone().multiplyScalar(delta);
    b.position.add(deltaMove);
  }
}

init(setupScene, onFrame);
