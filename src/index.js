/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { XR_AXES } from 'gamepad-wrapper';
import { init } from './init.js';

function setupScene({ scene, camera, renderer, player, controllers }) {
  const loader = new GLTFLoader();
  loader.load('assets/tank1.glb', (gltf) => {
    const tank = gltf.scene;
    // Place the tank a few meters in front of the player
    const forward = new THREE.Vector3();
    const playerPos = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0; // keep on ground plane
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    player.getWorldPosition(playerPos);
    const distance = 3; // meters in front
    tank.position.copy(playerPos.add(forward.multiplyScalar(distance)));
    tank.position.y = 0; // ground level
    tank.rotation.y = (Math.PI / 2) + Math.PI; // rotate 270° total (90° + 180°)
    scene.add(tank);
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
}

const ZOOM_SPEED = 2.0; // meters per second at full deflection
const DEADZONE = 0.15;

function onFrame(delta, time, { controllers, camera, player }) {
  if (controllers.left) {
    // Left thumbstick up/down to zoom (move player along view direction)
    const gp = controllers.left.gamepad;
    let y = 0;
    if (gp && typeof gp.getAxis === 'function') {
      try {
        y = gp.getAxis(XR_AXES.THUMBSTICK_Y) ?? 0;
      } catch (e) {
        // Fallback if axis retrieval throws
        y = 0;
      }
    } else if (gp && gp.gamepad && Array.isArray(gp.gamepad.axes)) {
      // Fallback to raw axes if available; typical WebXR mapping uses index 3 for Y
      y = gp.gamepad.axes[3] ?? 0;
    }
    if (Math.abs(y) > DEADZONE) {
      const amount = -y; // up (-1) => forward (+)
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      player.position.addScaledVector(dir, amount * ZOOM_SPEED * delta);
    }
  }
}

init(setupScene, onFrame);
