const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ESLintPlugin = require('eslint-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
	mode: 'development',
	entry: {
		index: './src/index.js',
	},
	devServer: {
		static: {
			directory: path.join(__dirname, 'dist'),
		},
		host: '0.0.0.0',
		server: 'https',
		compress: true,
		port: 8081,
		client: {
			overlay: { warnings: false, errors: true },
		},
		// Attach a same-origin WebSocket endpoint for lightweight multiplayer
		// Clients connect to wss://<host>:8081/players
		setupMiddlewares: (middlewares, devServer) => {
			// Lazy-require to avoid needing 'ws' for production builds
			const WebSocket = require('ws');
			if (!devServer || !devServer.server) return middlewares;

			// Create a WS server bound to the existing HTTPS server
			const wss = new WebSocket.Server({ server: devServer.server, path: '/players' });
			console.log('[dev] Multiplayer WS ready at wss://<host>:8081/players');

			// id -> { id, name, color, state: { p:[x,y,z], r:[x,y,z] }, ws }
			const players = new Map();
			let nextId = 1;

			const assignNameColor = () => {
				const inUse = new Set([...players.values()].map((p) => p.name));
				if (!inUse.has('spieler rot')) return { name: 'spieler rot', color: 0xff3333 };
				if (!inUse.has('spieler blau')) return { name: 'spieler blau', color: 0x3333ff };
				const n = players.size + 1;
				return { name: `spieler ${n}`, color: 0xcccccc };
			};

			const broadcast = (obj, exclude) => {
				const data = JSON.stringify(obj);
				wss.clients.forEach((client) => {
					if (client !== exclude && client.readyState === WebSocket.OPEN) client.send(data);
				});
			};

			wss.on('connection', (ws) => {
				console.log('[dev] Multiplayer client connecting...');
				const id = String(nextId++);
				const { name, color } = assignNameColor();
				players.set(id, {
					id,
					name,
					color,
					state: { p: [0, 1.6, 0.5], r: [0, 0, 0] },
					ws,
				});

				// Send welcome with existing players
				ws.send(
					JSON.stringify({
						type: 'welcome',
						self: { id, name, color },
						players: [...players.entries()]
							.filter(([pid]) => pid !== id)
							.map(([pid, p]) => ({ id: pid, name: p.name, color: p.color, state: p.state })),
					}),
				);

				// Inform others of the new joiner
				broadcast({ type: 'join', player: { id, name, color } }, ws);

				ws.on('message', (data) => {
					try {
						const msg = JSON.parse(data.toString());
						if (
							msg.type === 'state' &&
							Array.isArray(msg.p) && msg.p.length === 3 &&
							Array.isArray(msg.r) && msg.r.length === 3
						) {
							const rec = players.get(id);
							if (rec) rec.state = { p: msg.p, r: msg.r };
							broadcast({ type: 'state', id, state: rec.state }, ws);
						}
					} catch {}
				});

				ws.on('close', () => {
					players.delete(id);
					broadcast({ type: 'leave', id });
				});

				ws.on('error', (err) => {
					console.error('[dev] Multiplayer client error:', err?.message || err);
				});
			});

			return middlewares;
		},
	},
	output: {
		filename: '[name].bundle.js',
		path: path.resolve(__dirname, 'dist'),
		clean: true,
	},
	plugins: [
		new ESLintPlugin({
			extensions: ['js'],
			eslintPath: require.resolve('eslint'),
			overrideConfigFile: path.resolve(__dirname, './.eslintrc.cjs'),
		}),
		new HtmlWebpackPlugin({
			template: './src/index.html',
		}),
		new CopyPlugin({
			patterns: [{ from: 'src/assets', to: 'assets' }],
		}),
	],
	devtool: 'source-map',
};
