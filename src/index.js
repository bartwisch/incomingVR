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
let scoreText = null;
let score = 0;

const HUD_COLOR = 0x00ff00;
const HUD_FONT = '/assets/SpaceMono-Bold.ttf';

// Shooting state
let bulletGroup = null;
let bulletGeo = null;
let bulletMat = null;
let laserMat = null;
let machineMat = null;
const bullets = [];
let explosionGroup = null;
let explosionGeo = null;
let explosionMat = null;
const explosions = [];
let audioListener = null;
let cannonBuffer = null;
let laserBuffer = null;
let crosshair = null;
let leftCannon = null;
let rightCannon = null;
const weaponType = { left: 'cannon', right: 'cannon' };
const WEAPON_TYPES = ['cannon', 'laser', 'machinegun'];
const nextWeapon = (current) =>
	WEAPON_TYPES[(WEAPON_TYPES.indexOf(current) + 1) % WEAPON_TYPES.length];
let prevLeftSwitch = false;
let prevRightSwitch = false;
const keyState = { left: false, right: false };
window.addEventListener('keydown', (e) => {
	if (e.code === 'KeyZ') keyState.left = true;
	if (e.code === 'KeyX') keyState.right = true;
});
window.addEventListener('keyup', (e) => {
	if (e.code === 'KeyZ') keyState.left = false;
	if (e.code === 'KeyX') keyState.right = false;
});

function setupScene({ scene, camera }) {
	// Blue sky background
	scene.background = new THREE.Color(0x87ceeb);

	// Crosshair at center of view
	crosshair = new THREE.Mesh(
		new THREE.RingGeometry(0.02, 0.04, 32),
		new THREE.MeshBasicMaterial({
			color: 0xffffff,
			opacity: 0.8,
			transparent: true,
		}),
	);
	crosshair.position.set(0, 0, -5);
	crosshair.scale.set(2.5, 2.5, 2.5);
	camera.add(crosshair);
	const cannonGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8);
	cannonGeo.rotateX(Math.PI / 2);
	const cannonMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
	leftCannon = new THREE.Mesh(cannonGeo, cannonMat);
	rightCannon = new THREE.Mesh(cannonGeo, cannonMat);
	leftCannon.position.set(-0.3, -0.15, -0.6);
	rightCannon.position.set(0.3, -0.15, -0.6);
	camera.add(leftCannon);
	camera.add(rightCannon);

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
	playerPosText.color = HUD_COLOR;
	playerPosText.font = HUD_FONT;
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
	playerRotText.color = HUD_COLOR;
	playerRotText.font = HUD_FONT;
	playerRotText.anchorX = 'left';
	playerRotText.anchorY = 'top';
	playerRotText.position.set(-0.6, 0.37, -1.2);
	playerRotText.renderOrder = 1000;
	playerRotText.material.depthTest = false;
	playerRotText.material.depthWrite = false;
	camera.add(playerRotText);

	// HUD: score display
	scoreText = new Text();
	scoreText.text = 'Score: 0';
	scoreText.fontSize = 0.06;
	scoreText.color = HUD_COLOR;
	scoreText.font = HUD_FONT;
	scoreText.anchorX = 'right';
	scoreText.anchorY = 'top';
	scoreText.position.set(0.6, 0.43, -1.2);
	scoreText.renderOrder = 1000;
	scoreText.material.depthTest = false;
	scoreText.material.depthWrite = false;
	camera.add(scoreText);

	// Bullet prototype/shared
	bulletGeo = new THREE.SphereGeometry(BULLET_RADIUS, 16, 12);
	bulletMat = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
	laserMat = new THREE.MeshStandardMaterial({
		color: 0x00ffff,
		emissive: 0x00ffff,
	});
	machineMat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
	bulletGroup = new THREE.Group();
	scene.add(bulletGroup);

	// Enemy placeholders: shared geometry/materials and group
	const enemyGeo = new THREE.IcosahedronGeometry(ENEMY_RADIUS, 0);
	const enemyMats = [
		new THREE.MeshStandardMaterial({
			color: 0xff3333,
			metalness: 0.1,
			roughness: 0.8,
		}),
		new THREE.MeshStandardMaterial({
			color: 0x3333ff,
			metalness: 0.1,
			roughness: 0.8,
		}),
	];
	const enemyGroup = new THREE.Group();
	enemyGroup.name = 'enemies';
	scene.add(enemyGroup);

	// Stash geometry, materials and group for use in onFrame
	bulletGroup.userData.enemyGeo = enemyGeo;
	bulletGroup.userData.enemyMats = enemyMats;
	bulletGroup.userData.enemyGroup = enemyGroup;

	// Explosion placeholders
	explosionGeo = new THREE.SphereGeometry(1, 16, 12);
	explosionMat = new THREE.MeshBasicMaterial({
		color: 0xff8800,
		transparent: true,
		opacity: 0.7,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
	});
	explosionGroup = new THREE.Group();
	scene.add(explosionGroup);

	// Audio: listener + load shot buffer (prefer shot1.mp3 with fallbacks)
	audioListener = new THREE.AudioListener();
	camera.add(audioListener);
	const audioLoader = new THREE.AudioLoader();
	const tryLoad = (url, next) => {
		audioLoader.load(
			url,
			(buffer) => {
				cannonBuffer = buffer;
			},
			undefined,
			() => {
				if (next) next();
			},
		);
	};
	tryLoad('assets/shot1.mp3', () =>
		tryLoad('assets/big_caliber_gunshot-1757083126996.mp3'),
	);
	audioLoader.load('assets/laser.ogg', (buffer) => {
		laserBuffer = buffer;
	});
}

const DEADZONE = 0.15;
const PLAYER_MOVE_SPEED = 2.0; // m/s for left-stick locomotion
const PLAYER_TURN_SPEED = Math.PI; // rad/s for right-stick yaw turn (180°/s)
// Feature flag: left thumbstick locomotion
const ENABLE_LEFT_LOCO = false;
const BULLET_RADIUS = 0.05; // meters
const BULLET_SPEED = 10; // m/s
const BULLET_TTL = 2.0; // seconds
const FIRE_RATE = 3; // bullets per second per cannon
const MACHINE_GUN_RATE = 10; // bullets per second for machine gun
let leftFireTimer = 0;
let rightFireTimer = 0;
let prevLeftFiring = false;
let prevRightFiring = false;
// Enemies
const ENEMY_RADIUS = 0.3; // meters
const ENEMY_SPEED = 2.5; // m/s toward player
const ENEMY_SPAWN_INTERVAL = 1.5; // seconds
const ENEMY_Y_OFFSET = 6.0; // spawn height above player
const ENEMY_AHEAD_MIN = 6.0; // min distance ahead of player
const ENEMY_AHEAD_MAX = 12.0; // max distance ahead of player
const ENEMY_SPREAD_DEG = 45; // degrees of lateral spread
let enemySpawnTimer = 0;
const EXPLOSION_TTL = 0.6; // seconds
const EXPLOSION_GROWTH = 4; // scale units per second

function onFrame(delta, _time, { controllers, camera, player }) {
	if (scoreText) {
		scoreText.text = `Score: ${score}`;
		scoreText.sync();
	}
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

	// Left thumbstick locomotion (disabled via feature flag)
	if (ENABLE_LEFT_LOCO && controllers.left && player && camera) {
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

	// Left thumbstick: rotate player yaw (no pitch), inverted direction
	if (controllers.left && player) {
		const gp = controllers.left.gamepad;
		let lx = 0;
		if (gp && typeof gp.getAxis === 'function') {
			try {
				lx = gp.getAxis(XR_AXES.THUMBSTICK_X) ?? 0;
			} catch {
				lx = 0;
			}
		} else if (gp && gp.gamepad && Array.isArray(gp.gamepad.axes)) {
			lx = gp.gamepad.axes[2] ?? 0;
		}
		if (Math.abs(lx) > DEADZONE) {
			// Invert horizontal stick input and only affect yaw
			player.rotation.y += -lx * PLAYER_TURN_SPEED * delta;
		}
	}

	// Both thumbsticks: rotate player yaw (no pitch), inverted direction
	if (player) {
		let yawDelta = 0;

		// Right thumbstick
		if (controllers.right) {
			const gp = controllers.right.gamepad;
			let rx = 0;
			if (gp && typeof gp.getAxis === 'function') {
				try {
					rx = gp.getAxis(XR_AXES.THUMBSTICK_X) ?? 0;
				} catch {
					rx = 0;
				}
			} else if (gp && gp.gamepad && Array.isArray(gp.gamepad.axes)) {
				rx = gp.gamepad.axes[2] ?? 0;
			}
			if (Math.abs(rx) > DEADZONE) {
				yawDelta += -rx;
			}
		}

		// Left thumbstick
		if (controllers.left) {
			const gp = controllers.left.gamepad;
			let lx = 0;
			if (gp && typeof gp.getAxis === 'function') {
				try {
					lx = gp.getAxis(XR_AXES.THUMBSTICK_X) ?? 0;
				} catch {
					lx = 0;
				}
			} else if (gp && gp.gamepad && Array.isArray(gp.gamepad.axes)) {
				lx = gp.gamepad.axes[2] ?? 0;
			}
			if (Math.abs(lx) > DEADZONE) {
				yawDelta += -lx;
			}
		}

		if (yawDelta !== 0) {
			// Ensure both sticks rotate at the same max speed
			// (do not double rotation when both are held)
			yawDelta = THREE.MathUtils.clamp(yawDelta, -1, 1);
			player.rotation.y += yawDelta * PLAYER_TURN_SPEED * delta;
		}
	}

	// Enemies: spawn, move, and handle bullet collisions
	const enemyGroup = bulletGroup?.userData?.enemyGroup;
	const enemyGeo = bulletGroup?.userData?.enemyGeo;
	const enemyMats = bulletGroup?.userData?.enemyMats;

	if (enemyGroup && enemyGeo && enemyMats) {
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
			const mat = enemyMats[Math.floor(Math.random() * enemyMats.length)];
			const enemy = new THREE.Mesh(enemyGeo, mat);
			enemy.position.copy(start);
			enemy.userData = {
				vel: dir.multiplyScalar(ENEMY_SPEED),
				hp: 1,
				radius: ENEMY_RADIUS,
			};
			enemyGroup.add(enemy);
		}

		// Move enemies and remove out-of-bounds ones
		for (let i = enemyGroup.children.length - 1; i >= 0; i--) {
			const e = enemyGroup.children[i];
			e.position.addScaledVector(e.userData.vel, delta);
			if (e.position.y < -2 || e.position.distanceTo(player.position) > 60) {
				enemyGroup.remove(e);
			}
		}

		// Check bullet-enemy collisions
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
					const ex = new THREE.Mesh(explosionGeo, explosionMat.clone());
					ex.position.copy(hit.position);
					ex.scale.setScalar(0.1);
					ex.userData = {
						ttl: EXPLOSION_TTL,
						growth: EXPLOSION_GROWTH,
					};
					explosionGroup.add(ex);
					explosions.push(ex);
					enemyGroup.remove(hit);
					score += 100;
				}
			}
		}
	}

	const aimTarget = new THREE.Vector3();
	if (crosshair) {
		crosshair.getWorldPosition(aimTarget);
		leftCannon?.lookAt(aimTarget);
		rightCannon?.lookAt(aimTarget);
	}

	// Weapon switching: BUTTON_1 (A/X) cycles per controller
	const leftSwitchDown = !!(
		controllers.left &&
		controllers.left.gamepad &&
		((typeof controllers.left.gamepad.getButton === 'function' &&
			controllers.left.gamepad.getButton(XR_BUTTONS.BUTTON_1)) ||
			(typeof controllers.left.gamepad.getButtonPressed === 'function' &&
				controllers.left.gamepad.getButtonPressed(XR_BUTTONS.BUTTON_1)) ||
			(controllers.left.gamepad.gamepad &&
				controllers.left.gamepad.gamepad.buttons &&
				controllers.left.gamepad.gamepad.buttons[4]?.pressed))
	);
	const rightSwitchDown = !!(
		controllers.right &&
		controllers.right.gamepad &&
		((typeof controllers.right.gamepad.getButton === 'function' &&
			controllers.right.gamepad.getButton(XR_BUTTONS.BUTTON_1)) ||
			(typeof controllers.right.gamepad.getButtonPressed === 'function' &&
				controllers.right.gamepad.getButtonPressed(XR_BUTTONS.BUTTON_1)) ||
			(controllers.right.gamepad.gamepad &&
				controllers.right.gamepad.gamepad.buttons &&
				controllers.right.gamepad.gamepad.buttons[4]?.pressed))
	);
	if (leftSwitchDown && !prevLeftSwitch) {
		weaponType.left = nextWeapon(weaponType.left);
	}
	if (rightSwitchDown && !prevRightSwitch) {
		weaponType.right = nextWeapon(weaponType.right);
	}
	prevLeftSwitch = leftSwitchDown;
	prevRightSwitch = rightSwitchDown;

	// Firing: triggers or Z/X keys fire respective cannons
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

	const leftFiring = leftTriggerDown || keyState.left;
	const rightFiring = rightTriggerDown || keyState.right;
	const leftInterval =
		1 / (weaponType.left === 'machinegun' ? MACHINE_GUN_RATE : FIRE_RATE);
	const rightInterval =
		1 / (weaponType.right === 'machinegun' ? MACHINE_GUN_RATE : FIRE_RATE);

	if (leftFiring && !prevLeftFiring) {
		leftFireTimer = leftInterval;
	}
	if (rightFiring && !prevRightFiring) {
		rightFireTimer = rightInterval;
	}

	if (leftFiring && bulletGeo && bulletGroup && leftCannon) {
		const type = weaponType.left;
		const mat =
			type === 'laser'
				? laserMat
				: type === 'machinegun'
					? machineMat
					: bulletMat;
		const buffer = type === 'laser' ? laserBuffer : cannonBuffer;
		leftFireTimer += delta;
		while (leftFireTimer >= leftInterval) {
			leftFireTimer -= leftInterval;
			const start = new THREE.Vector3();
			leftCannon.getWorldPosition(start);
			const dir = aimTarget.clone().sub(start).normalize();
			const mesh = new THREE.Mesh(bulletGeo, mat);
			mesh.position.copy(start);
			mesh.userData = {
				vel: dir.clone().multiplyScalar(BULLET_SPEED),
				ttl: BULLET_TTL,
			};
			if (buffer && audioListener) {
				const shot = new THREE.PositionalAudio(audioListener);
				shot.setBuffer(buffer);
				shot.setRefDistance(2);
				shot.setVolume(0.6);
				mesh.add(shot);
				shot.play();
			}
			bulletGroup.add(mesh);
			bullets.push(mesh);
		}
	} else {
		leftFireTimer = 0;
	}

	if (rightFiring && bulletGeo && bulletGroup && rightCannon) {
		const type = weaponType.right;
		const mat =
			type === 'laser'
				? laserMat
				: type === 'machinegun'
					? machineMat
					: bulletMat;
		const buffer = type === 'laser' ? laserBuffer : cannonBuffer;
		rightFireTimer += delta;
		while (rightFireTimer >= rightInterval) {
			rightFireTimer -= rightInterval;
			const start = new THREE.Vector3();
			rightCannon.getWorldPosition(start);
			const dir = aimTarget.clone().sub(start).normalize();
			const mesh = new THREE.Mesh(bulletGeo, mat);
			mesh.position.copy(start);
			mesh.userData = {
				vel: dir.clone().multiplyScalar(BULLET_SPEED),
				ttl: BULLET_TTL,
			};
			if (buffer && audioListener) {
				const shot = new THREE.PositionalAudio(audioListener);
				shot.setBuffer(buffer);
				shot.setRefDistance(2);
				shot.setVolume(0.6);
				mesh.add(shot);
				shot.play();
			}
			bulletGroup.add(mesh);
			bullets.push(mesh);
		}
	} else {
		rightFireTimer = 0;
	}

	prevLeftFiring = leftFiring;
	prevRightFiring = rightFiring;

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
	for (let i = explosions.length - 1; i >= 0; i--) {
		const ex = explosions[i];
		ex.userData.ttl -= delta;
		const s = ex.scale.x + ex.userData.growth * delta;
		ex.scale.setScalar(s);
		ex.material.opacity = (ex.userData.ttl / EXPLOSION_TTL) * 0.7;
		if (ex.userData.ttl <= 0) {
			explosionGroup.remove(ex);
			explosions.splice(i, 1);
		}
	}
}

init(setupScene, onFrame);
