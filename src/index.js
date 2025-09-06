/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';
import { XR_AXES, XR_BUTTONS } from 'gamepad-wrapper';
import { Text } from 'troika-three-text';
import { init } from './init.js';

let playerPosText = null;
let playerRotText = null;

// Shooting state
let bulletGroup = null;
let bulletGeo = null;
let bulletMat = null;
const bullets = [];
let audioListener = null;
let shotBuffer = null;

function setupScene({ scene, camera }) {
	// Crosshair at center of view
	const crosshair = new THREE.Mesh(
		new THREE.RingGeometry(0.02, 0.04, 32),
		new THREE.MeshBasicMaterial({
			color: 0xffffff,
			opacity: 0.8,
			transparent: true,
		}),
	);
	crosshair.position.set(0, 0, -2);
	camera.add(crosshair);

	// World reference: origin axes + ground grid
	const worldAxes = new THREE.AxesHelper(2);
	scene.add(worldAxes);
	const grid = new THREE.GridHelper(40, 40, 0x444444, 0x222222);
	scene.add(grid);

	// World axis numeric labels along X and Z (every 2 units)
	const labelMaterialOpts = { depthTest: false, depthWrite: false };
	const mkLabel = (
		text,
		pos,
		color = 0xffffff,
		size = 0.06,
		anchorX = 'center',
		anchorY = 'middle',
	) => {
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

	// HUD: display player rotation (yaw/pitch/roll in degrees)
	playerRotText = new Text();
	playerRotText.text = 'Player Rot: yaw=0 pitch=0 roll=0';
	playerRotText.fontSize = 0.06;
	playerRotText.color = 0xffffff;
	playerRotText.anchorX = 'left';
	playerRotText.anchorY = 'top';
	playerRotText.position.set(-0.6, 0.37, -1.2);
	playerRotText.renderOrder = 1000;
	playerRotText.material.depthTest = false;
	playerRotText.material.depthWrite = false;
	camera.add(playerRotText);

	// Bullet prototype/shared
	bulletGeo = new THREE.SphereGeometry(BULLET_RADIUS, 16, 12);
	bulletMat = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
	bulletGroup = new THREE.Group();
	scene.add(bulletGroup);

	// Enemy placeholders: shared geometry/material and group
	const enemyGeo = new THREE.IcosahedronGeometry(ENEMY_RADIUS, 0);
	const enemyMat = new THREE.MeshStandardMaterial({
		color: 0xff3333,
		metalness: 0.1,
		roughness: 0.8,
	});
	const enemyGroup = new THREE.Group();
	enemyGroup.name = 'enemies';
	scene.add(enemyGroup);
	// Stash factory and group for use in onFrame
	bulletGroup.userData.enemyGeo = enemyGeo;
	bulletGroup.userData.enemyMat = enemyMat;
	bulletGroup.userData.enemyGroup = enemyGroup;

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
const PLAYER_TURN_SPEED = Math.PI; // rad/s for right-stick yaw turn (180°/s)
const BULLET_RADIUS = 0.05; // meters
const BULLET_SPEED = 10; // m/s
const BULLET_TTL = 2.0; // seconds
const FIRE_RATE = 3; // per second when both triggers held
let fireTimer = 0;
// Enemies
const ENEMY_RADIUS = 0.3; // meters
const ENEMY_SPEED = 2.5; // m/s toward player
const ENEMY_SPAWN_INTERVAL = 1.5; // seconds
const ENEMY_Y_OFFSET = 6.0; // spawn height above player
const ENEMY_AHEAD_MIN = 6.0; // min distance ahead of player
const ENEMY_AHEAD_MAX = 12.0; // max distance ahead of player
const ENEMY_SPREAD_DEG = 35; // half-angle spread around forward
let enemySpawnTimer = 0;

function onFrame(delta, _time, { controllers, camera, player }) {
	// Update player position HUD
	if (playerPosText && player) {
		const p = new THREE.Vector3();
		player.getWorldPosition(p);
		playerPosText.text = `Player: x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} z=${p.z.toFixed(2)}`;
		playerPosText.sync();
	}

	// Update player rotation HUD
	if (playerRotText && player) {
		const q = new THREE.Quaternion();
		player.getWorldQuaternion(q);
		const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
		const yawDeg = THREE.MathUtils.radToDeg(e.y);
		const pitchDeg = THREE.MathUtils.radToDeg(e.x);
		const rollDeg = THREE.MathUtils.radToDeg(e.z);
		playerRotText.text = `Player Rot: yaw=${yawDeg.toFixed(0)}° pitch=${pitchDeg.toFixed(0)}° roll=${rollDeg.toFixed(0)}°`;
		playerRotText.sync();
	}

	if (controllers.left && player && camera) {
		// Left thumbstick: locomotion on XZ plane (forward/back + strafe)
		const gp = controllers.left.gamepad;
		let lx = 0;
		let ly = 0;
		if (gp && typeof gp.getAxis === 'function') {
			try {
				lx = gp.getAxis(XR_AXES.THUMBSTICK_X) ?? 0;
			} catch {
				lx = 0;
			}
			try {
				ly = gp.getAxis(XR_AXES.THUMBSTICK_Y) ?? 0;
			} catch {
				ly = 0;
			}
		} else if (gp && gp.gamepad && Array.isArray(gp.gamepad.axes)) {
			lx = gp.gamepad.axes[2] ?? 0;
			ly = gp.gamepad.axes[3] ?? 0;
		}
		if (Math.abs(lx) > DEADZONE || Math.abs(ly) > DEADZONE) {
			const fwd = new THREE.Vector3();
			camera.getWorldDirection(fwd);
			fwd.y = 0;
			fwd.normalize();
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

	// Right thumbstick: rotate player yaw and change height
	if (controllers.right && player) {
		const gp = controllers.right.gamepad;
		let rx = 0;
		let ry = 0;
		if (gp && typeof gp.getAxis === 'function') {
			try {
				rx = gp.getAxis(XR_AXES.THUMBSTICK_X) ?? 0;
			} catch {
				rx = 0;
			}
			try {
				ry = gp.getAxis(XR_AXES.THUMBSTICK_Y) ?? 0;
			} catch {
				ry = 0;
			}
		} else if (gp && gp.gamepad && Array.isArray(gp.gamepad.axes)) {
			rx = gp.gamepad.axes[2] ?? 0;
			ry = gp.gamepad.axes[3] ?? 0;
		}
		if (Math.abs(rx) > DEADZONE) {
			player.rotation.y += rx * PLAYER_TURN_SPEED * delta;
		}
		if (Math.abs(ry) > DEADZONE) {
			player.position.y += -ry * PLAYER_ELEVATE_SPEED * delta;
		}
	}

	// Enemies: spawn, move, and handle bullet collisions
	const enemyGroup = bulletGroup?.userData?.enemyGroup;
	const enemyGeo = bulletGroup?.userData?.enemyGeo;
	const enemyMat = bulletGroup?.userData?.enemyMat;
	if (enemyGroup && enemyGeo && enemyMat) {
		enemySpawnTimer += delta;
		while (enemySpawnTimer >= ENEMY_SPAWN_INTERVAL) {
			enemySpawnTimer -= ENEMY_SPAWN_INTERVAL;
			const ppos = new THREE.Vector3();
			player.getWorldPosition(ppos);
			const yaw = player.rotation.y;
			const fwd = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
			const right = new THREE.Vector3(fwd.z, 0, -fwd.x).normalize();
			const ahead =
				ENEMY_AHEAD_MIN + Math.random() * (ENEMY_AHEAD_MAX - ENEMY_AHEAD_MIN);
			const spreadRad = THREE.MathUtils.degToRad(ENEMY_SPREAD_DEG);
			const ang = (Math.random() * 2 - 1) * spreadRad;
			const lateral = Math.tan(ang) * ahead;
			const start = ppos
				.clone()
				.addScaledVector(fwd, ahead)
				.addScaledVector(right, lateral);
			start.y = ppos.y + ENEMY_Y_OFFSET;
			const dir = ppos.clone().sub(start).normalize();
			const enemy = new THREE.Mesh(enemyGeo, enemyMat);
			enemy.position.copy(start);
			enemy.userData = {
				vel: dir.multiplyScalar(ENEMY_SPEED),
				hp: 1,
				radius: ENEMY_RADIUS,
			};
			enemyGroup.add(enemy);
		}

		for (let i = enemyGroup.children.length - 1; i >= 0; i--) {
			const e = enemyGroup.children[i];
			e.position.addScaledVector(e.userData.vel, delta);
			if (e.position.y < -2 || e.position.distanceTo(player.position) > 60) {
				enemyGroup.remove(e);
			}
		}

		for (let bi = bullets.length - 1; bi >= 0; bi--) {
			const b = bullets[bi];
			const bp = b.position;
			let hit = null;
			for (let ei = enemyGroup.children.length - 1; ei >= 0; ei--) {
				const e = enemyGroup.children[ei];
				const sumR = BULLET_RADIUS + (e.userData.radius ?? ENEMY_RADIUS);
				if (bp.distanceTo(e.position) <= sumR) {
					hit = e;
					e.userData.hp -= 1;
					break;
				}
			}
			if (hit) {
				bulletGroup.remove(b);
				bullets.splice(bi, 1);
				if (hit.userData.hp <= 0) {
					enemyGroup.remove(hit);
				}
			}
		}
	}

	// Firing: both triggers held => shoot balls forward from camera
	const leftTriggerDown = !!(
		controllers.left &&
		controllers.left.gamepad &&
		((typeof controllers.left.gamepad.getButton === 'function' &&
			controllers.left.gamepad.getButton(XR_BUTTONS.TRIGGER)) ||
			(typeof controllers.left.gamepad.getButtonPressed === 'function' &&
				controllers.left.gamepad.getButtonPressed(XR_BUTTONS.TRIGGER)) ||
			(controllers.left.gamepad.gamepad &&
				controllers.left.gamepad.gamepad.buttons &&
				controllers.left.gamepad.gamepad.buttons[0]?.pressed))
	);
	const rightTriggerDown = !!(
		controllers.right &&
		controllers.right.gamepad &&
		((typeof controllers.right.gamepad.getButton === 'function' &&
			controllers.right.gamepad.getButton(XR_BUTTONS.TRIGGER)) ||
			(typeof controllers.right.gamepad.getButtonPressed === 'function' &&
				controllers.right.gamepad.getButtonPressed(XR_BUTTONS.TRIGGER)) ||
			(controllers.right.gamepad.gamepad &&
				controllers.right.gamepad.gamepad.buttons &&
				controllers.right.gamepad.gamepad.buttons[0]?.pressed))
	);
	const bothTriggers = leftTriggerDown && rightTriggerDown;

	if (bothTriggers && bulletGeo && bulletMat && bulletGroup) {
		fireTimer += delta;
		const interval = 1 / FIRE_RATE;
		while (fireTimer >= interval) {
			fireTimer -= interval;
			const q = new THREE.Quaternion();
			camera.getWorldQuaternion(q);
			const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize();
			const start = new THREE.Vector3();
			camera.getWorldPosition(start);
			start.addScaledVector(dir, 0.5);
			const mesh = new THREE.Mesh(bulletGeo, bulletMat);
			mesh.position.copy(start);
			mesh.quaternion.copy(q);
			mesh.userData = {
				vel: dir.clone().multiplyScalar(BULLET_SPEED),
				ttl: BULLET_TTL,
			};
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
		fireTimer = 0;
	}

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
