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
let prevHandsAngle = null;

function setupScene({ scene, camera, renderer: _renderer, player, controllers: _controllers }) {
  const loader = new GLTFLoader();
  loader.load('assets/tank1.glb', (gltf) => {
    const tank = gltf.scene;

    // Compute desired world position a few meters in front of the player
    const forward = new THREE.Vector3();
    const playerPos = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0; // keep on ground plane
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    player.getWorldPosition(playerPos);
    const distance = 3; // meters in front
    const targetPos = playerPos.add(forward.multiplyScalar(distance));
    targetPos.y = 0; // ground level pivot

    // Create pivot at target position and center the tank inside it
    tankPivot = new THREE.Group();
    tankPivot.position.copy(targetPos);
    scene.add(tankPivot);
    tankPivot.add(tank);

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

    // Axis labels (X, Y, Z)
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

  // Create a HUD crosshair centered in view
  const innerRadius = 0.01; // meters
  const outerRadius = 0.02; // meters
  const crosshairGeom = new THREE.RingGeometry(innerRadius, outerRadius, 48);
  const crosshairMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    depthTest: false,   // render on top
    depthWrite: false,
  });
  const crosshair = new THREE.Mesh(crosshairGeom, crosshairMat);
  crosshair.renderOrder = 999; // ensure drawn last
  crosshair.position.set(0, 0, -1.2); // distance in front of camera
  crosshair.frustumCulled = false;
  camera.add(crosshair);

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
}

const DEADZONE = 0.15;
const PLAYER_MOVE_SPEED = 2.0; // m/s for left-stick locomotion
const PLAYER_TURN_SPEED = 2.5; // rad/s yaw for right-stick turn

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
  } else {
    // reset tracking when not both held
    prevHandsAngle = null;
  }

  // Right thumbstick: rotate player yaw (camera turns)
  if (controllers.right && player) {
    const gp = controllers.right.gamepad;
    let rx = 0;
    if (gp && typeof gp.getAxis === 'function') {
      try { rx = gp.getAxis(XR_AXES.THUMBSTICK_X) ?? 0; } catch { rx = 0; }
    } else if (gp && gp.gamepad && Array.isArray(gp.gamepad.axes)) {
      rx = gp.gamepad.axes[2] ?? 0;
    }
    if (Math.abs(rx) > DEADZONE) {
      // Right (+) -> turn right (negative yaw)
      player.rotation.y += (-rx) * PLAYER_TURN_SPEED * delta;
    }
  }
}

init(setupScene, onFrame);
