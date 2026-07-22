/* Temporary release diagnostic: inspect rendered basket scripts without ordering. */
const fs = require('node:fs');
const endpoint = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';
const product = 'https://sinisterdiesel.com/sinister-diesel-bypass-oil-filter-system-for-1999-2003-ford-powerstroke-73l.html';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
	const useCleanContext = process.env.CLEAN_CONTEXT === '1';
	let target;
	let browserContextId = '';
	let sessionId = '';
	let webSocketUrl;
	if (useCleanContext) {
		webSocketUrl = (await (await fetch(`${endpoint}/json/version`)).json()).webSocketDebuggerUrl;
	} else {
		target = await (await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' })).json();
		webSocketUrl = target.webSocketDebuggerUrl;
	}
	const ws = new WebSocket(webSocketUrl);
	await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
	let id = 0;
	const pending = new Map();
	const runtimeErrors = [];
	const failedScripts = [];
	let basketDocumentRequestId = '';
	ws.onmessage = (event) => {
		const message = JSON.parse(event.data);
		if (message.id && pending.has(message.id)) {
			const request = pending.get(message.id);
			pending.delete(message.id);
			return message.error ? request.reject(message.error) : request.resolve(message.result || {});
		}
		if (message.method === 'Runtime.exceptionThrown') {
			const details = message.params.exceptionDetails;
			runtimeErrors.push({
				description: details.exception?.description || details.text,
				url: details.url,
				lineNumber: details.lineNumber,
				columnNumber: details.columnNumber,
				scriptId: details.scriptId,
				stack: details.stackTrace
			});
		}
		if (message.method === 'Debugger.scriptFailedToParse') {
			failedScripts.push(message.params);
		}
		if (message.method === 'Network.responseReceived' &&
			message.params.type === 'Document' &&
			/basket-contents\.html/.test(message.params.response.url)) {
			basketDocumentRequestId = message.params.requestId;
		}
	};
	const call = (method, params = {}, targetSessionId = sessionId) => new Promise((resolve, reject) => {
		const requestId = ++id;
		pending.set(requestId, { resolve, reject });
		ws.send(JSON.stringify({ id: requestId, method, params, ...(targetSessionId ? { sessionId: targetSessionId } : {}) }));
	});
	if (useCleanContext) {
		browserContextId = (await call('Target.createBrowserContext', {}, '')).browserContextId;
		const created = await call('Target.createTarget', { url: 'about:blank', browserContextId }, '');
		target = { id: created.targetId };
		sessionId = (await call('Target.attachToTarget', { targetId: target.id, flatten: true }, '')).sessionId;
	}
	const evaluate = async (expression) => (await call('Runtime.evaluate', {
		expression, awaitPromise: true, returnByValue: true, userGesture: true
	})).result.value;
	const navigate = async (url, wait = 1800) => {
		await call('Page.navigate', { url });
		for (let count = 0; count < 120; count++) {
			if (await evaluate('document.readyState') === 'complete') break;
			await sleep(100);
		}
		await sleep(wait);
	};

	await Promise.all([call('Page.enable'), call('Runtime.enable'), call('Network.enable'), call('Debugger.enable')]);
	await call('Network.setCacheDisabled', { cacheDisabled: true });
	if (process.env.MOBILE === '1') {
		await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
	}
	try {
		await navigate(product);
		const added = await evaluate(`(() => {
			const form = [...document.forms].find((candidate) => candidate.elements.Action?.value === 'ADPR');
			if (!form) return false;
			form.querySelectorAll('input[type=checkbox][required]').forEach((control) => {
				control.checked = true;
				control.dispatchEvent(new Event('change', { bubbles: true }));
			});
			const button = [...form.querySelectorAll('button[type=submit],input[type=submit]')]
				.find((control) => /add to (?:cart|basket)/i.test(control.innerText || control.value || ''));
			if (!button || !form.checkValidity()) return false;
			form.requestSubmit ? form.requestSubmit(button) : button.click();
			return true;
		})()`);
		await sleep(3000);
		const postAdd = await evaluate(`(() => ({
			url: location.href,
			invalidInlineScripts: [...document.scripts].map((script, index) => {
				if (script.src || !script.textContent.trim()) return null;
				try { new Function(script.textContent); return null; }
				catch (error) { return { index, error: String(error), text: script.textContent }; }
			}).filter(Boolean)
		}))()`);
		fs.writeFileSync(`${process.env.TEMP}\\sd2-v2-release-20260721\\post-add-basket.html`, await evaluate('document.documentElement.outerHTML'));
		await navigate('https://sinisterdiesel.com/basket-contents.html');
		let responseSource = '';
		if (basketDocumentRequestId) {
			try {
				responseSource = (await call('Network.getResponseBody', { requestId: basketDocumentRequestId })).body;
			} catch (error) { responseSource = `BODY LOOKUP FAILED: ${String(error)}`; }
		}
		const diagnostic = await evaluate(`(async () => {
			const source = await fetch(location.href, { credentials: 'include', cache: 'no-store' }).then((response) => response.text());
			const lines = source.split(/\\r\\n|\\n|\\r/);
			const scripts = [...document.scripts].map((script, index) => {
				if (script.src || !script.textContent.trim()) return null;
				try {
					new Function(script.textContent);
					return null;
				} catch (error) {
					return { index, error: String(error), text: script.textContent.slice(0, 3000) };
				}
			}).filter(Boolean);
			const invalidHandlers = [...document.querySelectorAll('*')].flatMap((element) =>
				[...element.attributes]
					.filter((attribute) => /^on/i.test(attribute.name))
					.map((attribute) => {
						try {
							new Function('event', attribute.value);
							return null;
						} catch (error) {
							return { tag: element.tagName, name: attribute.name, value: attribute.value, error: String(error), html: element.outerHTML.slice(0, 2000) };
						}
					})
			).filter(Boolean);
			return {
				added: ${JSON.stringify(added)},
				url: location.href,
				lineWindow: lines.slice(555, 590).map((line, index) => ({ line: index + 556, text: line })),
				invalidInlineScripts: scripts,
				invalidHandlers,
				newContexts: [...source.matchAll(/.{0,180}New.{0,300}/g)].slice(0, 20).map((match) => match[0]),
				scriptCount: document.scripts.length,
				width: document.documentElement.scrollWidth,
				clientWidth: document.documentElement.clientWidth
			};
		})()`);
		if (process.env.MOBILE === '1') {
			const screenshot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true });
			fs.writeFileSync(`${process.env.TEMP}\\sd2-v2-release-20260721\\mobile-basket-with-item.png`, Buffer.from(screenshot.data, 'base64'));
		}
		const syntaxError = runtimeErrors.find((error) => /Unexpected identifier/.test(error.description));
		const siteParseFailure = failedScripts.find((script) => /basket-contents\.html/.test(script.url));
		let throwingScript = null;
		if (siteParseFailure?.scriptId || syntaxError?.scriptId) {
			try {
				const source = await call('Debugger.getScriptSource', { scriptId: siteParseFailure?.scriptId || syntaxError.scriptId });
				throwingScript = {
					url: syntaxError.url,
					lineNumber: syntaxError.lineNumber,
					columnNumber: syntaxError.columnNumber,
					source: source.scriptSource
				};
			} catch (error) {
				throwingScript = { lookupError: String(error) };
			}
		}
		const responseLines = responseSource.split(/\n/);
		console.log(JSON.stringify({
			postAdd,
			diagnostic,
			runtimeErrors,
			failedScripts,
			throwingScript,
			responseLineCount: responseLines.length,
			responseFailureWindow: responseLines.slice(562, 596).map((text, index) => ({ line: index + 563, text }))
		}, null, 2));
	} finally {
		await navigate('https://sinisterdiesel.com/basket-contents.html');
		const removed = await evaluate(`(() => {
			const control = [...document.querySelectorAll('a,button,input[type=submit]')]
				.find((node) => /remove|delete/i.test(node.innerText || node.value || node.getAttribute('aria-label') || ''));
			if (!control) return false;
			control.click();
			return true;
		})()`);
		if (removed) await sleep(2500);
		if (useCleanContext) {
			await call('Target.closeTarget', { targetId: target.id }, '');
			await call('Target.disposeBrowserContext', { browserContextId }, '');
		} else {
			await fetch(`${endpoint}/json/close/${target.id}`);
		}
		ws.close();
	}
})().catch((error) => { console.error(error); process.exit(1); });
