import * as THREE from 'three';

const SIGNALING_SERVER_URL = 'ws://localhost:8082';
const remotePlayers = {};

export function initMultiplayer(scene, camera) {
	const socket = new WebSocket(SIGNALING_SERVER_URL);

	socket.addEventListener('open', () => {
		socket.send(JSON.stringify({ type: 'join' }));
	});

	socket.addEventListener('message', (event) => {
		const msg = JSON.parse(event.data);
		if (msg.type === 'spawn' && !remotePlayers[msg.id]) {
			const mesh = new THREE.Mesh(
				new THREE.BoxGeometry(0.3, 0.3, 0.3),
				new THREE.MeshStandardMaterial({ color: 0x00ff00 }),
			);
			const spawnPos = camera.position.clone();
			spawnPos.x += 1;
			mesh.position.copy(spawnPos);
			scene.add(mesh);
			remotePlayers[msg.id] = mesh;
		}
	});
}
