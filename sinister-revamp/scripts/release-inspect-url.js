const endpoint = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';
const url = process.env.AUDIT_URL || 'https://sinisterdiesel.com/';
const expression = process.env.AUDIT_EXPRESSION || '({ url: location.href, title: document.title })';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fs = require('node:fs');

(async () => {
	const target = await (await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' })).json();
	const ws = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
	let id = 0;
	const pending = new Map();
	ws.onmessage = (event) => {
		const message = JSON.parse(event.data);
		if (!message.id || !pending.has(message.id)) return;
		const request = pending.get(message.id);
		pending.delete(message.id);
		message.error ? request.reject(message.error) : request.resolve(message.result || {});
	};
	const call = (method, params = {}) => new Promise((resolve, reject) => {
		const requestId = ++id;
		pending.set(requestId, { resolve, reject });
		ws.send(JSON.stringify({ id: requestId, method, params }));
	});
	const evaluate = async (code) => (await call('Runtime.evaluate', {
		expression: code, awaitPromise: true, returnByValue: true
	})).result.value;
	await Promise.all([call('Page.enable'), call('Runtime.enable'), call('Network.enable')]);
	await call('Network.setCacheDisabled', { cacheDisabled: true });
	if (process.env.MOBILE === '1') {
		await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
	}
	await call('Page.navigate', { url });
	for (let count = 0; count < 120; count++) {
		if (await evaluate('document.readyState') === 'complete') break;
		await sleep(100);
	}
	await sleep(600);
	console.log(JSON.stringify(await evaluate(expression), null, 2));
	if (process.env.SCREENSHOT_PATH) {
		const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
		fs.writeFileSync(process.env.SCREENSHOT_PATH, Buffer.from(shot.data, 'base64'));
	}
	ws.close();
	await fetch(`${endpoint}/json/close/${target.id}`);
})().catch((error) => { console.error(error); process.exit(1); });
