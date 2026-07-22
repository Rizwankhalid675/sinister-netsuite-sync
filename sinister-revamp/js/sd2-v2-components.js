/* ==========================================================================
   Sinister Diesel V2 Global Components
   Shared behavior for inactive V2 header, mega menu, search, garage, and cart.
   ========================================================================== */

/* Keep keyboard focus inside every open modal/drawer. This delegated guard
   also covers overlays moved under <body> after initialization. */
(function () {
	'use strict';
	var selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
	function activeDialog() {
		return document.querySelector('.sd2-v2-search-console.is-open, .sd2-v2-garage-panel.is-open, .sd2-v2-cart-panel.is-open, [data-v2-drawer].is-open');
	}
	document.addEventListener('keydown', function (event) {
		if (event.key !== 'Tab') { return; }
		var dialog = activeDialog();
		if (!dialog) { return; }
		var controls = Array.prototype.filter.call(dialog.querySelectorAll(selector), function (node) {
			return !node.hidden && node.getAttribute('aria-hidden') !== 'true' && (node.offsetWidth || node.offsetHeight || node.getClientRects().length);
		});
		if (!controls.length) { event.preventDefault(); dialog.focus(); return; }
		var first = controls[0];
		var last = controls[controls.length - 1];
		if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	});
}());

/* Retired campaign aliases can remain in email, search, and old footer caches.
   Recover the known Special Offers screen instead of presenting a 404. */
(function () {
	'use strict';
	var params = new URLSearchParams(window.location.search);
	if ((params.get('Screen') || '').toLowerCase() !== 'special-offers') { return; }
	var target = '/scratch-dent.html';
	var branchKey = params.get('BranchKey');
	if (branchKey) { target += '?BranchKey=' + encodeURIComponent(branchKey); }
	window.location.replace(target);
}());

/* The blog index and article pages share one Miva template. Give each route a
   stable hook so the index can keep its discovery hero while an article opens
   directly on the story the customer selected. */
(function () {
	'use strict';
	if (!document.body || !document.body.classList.contains('t-page-blog')) { return; }
	var path = window.location.pathname.toLowerCase();
	var isArticle = /^\/blog\/.+\.html\/?$/.test(path);
	document.body.classList.add(isArticle ? 'sd2-v18-blog-article' : 'sd2-v18-blog-index');
}());

/* Miva's legacy core dynamically loads theme extensions from theme_path.
   When a branch asset is present, keep those requests in the same branch so
   branch-safe null guards and extension updates are actually used. */
(function () {
	'use strict';
	var assetUrl = document.currentScript && document.currentScript.src;
	var match = assetUrl && assetUrl.match(/\/(b\d+)\//);
	if (match) {
		window.theme_path = match[1] + '/themes/colossus/';
	}
}());

/* Miva varies between an empty string and a literal zero for an empty basket.
   Keep the header badge state correct across initial render and AJAX updates. */
(function () {
	'use strict';
	function syncBadge(badge) {
		var count = parseInt((badge.textContent || '').trim(), 10) || 0;
		badge.hidden = count < 1;
		badge.setAttribute('aria-hidden', count < 1 ? 'true' : 'false');
	}
	document.querySelectorAll('.sd2-v2-hdr__cart-badge[data-hook="mini-basket-count"]').forEach(function (badge) {
		syncBadge(badge);
		new MutationObserver(function () { syncBadge(badge); }).observe(badge, { childList: true, characterData: true, subtree: true });
	});
}());

/* The legacy ReadyTheme proof-bar fragment contains a mis-decoded star in its
   source text. The branded star is drawn by CSS, so keep that presentation and
   give assistive technology a stable label instead of announcing mojibake. */
(function () {
	'use strict';
	document.querySelectorAll('.sd2-proofbar .rating').forEach(function (rating) {
		rating.setAttribute('aria-label', '4.8 out of 5 stars');
		rating.textContent = '';
	});
}());

/* Sticky shadow-on-scroll + mobile drawer/accordion. Mega menu, search
   console, garage panel, and cart drawer behaviors each live in their own
   component file and self-register against the trigger attributes above. */
(function () {
	'use strict';
	if (document.body && document.body.id === 'js-PATR' && !window.location.hash) {
		if ('scrollRestoration' in window.history) { window.history.scrollRestoration = 'manual'; }
		window.requestAnimationFrame(function () { window.scrollTo(0, 0); });
	}
	var header = document.querySelector('[data-v2-sticky-header]');
	if (header && !header.dataset.v2Ready) {
		header.dataset.v2Ready = '1';
		var onScroll = function () {
			header.classList.toggle('is-scrolled', window.scrollY > 4);
			var rect = header.getBoundingClientRect();
			document.documentElement.style.setProperty('--sd2-sticky-clearance', Math.max(0, Math.ceil(rect.bottom + 12)) + 'px');
		};
		document.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll, { passive: true });
		if ('ResizeObserver' in window) { new ResizeObserver(onScroll).observe(header); }
		onScroll();
	}

	var drawer = document.querySelector('[data-v2-drawer]');
	var scrim = document.querySelector('.sd2-v2-scrim');
	if (drawer && scrim && !drawer.dataset.v2Ready) {
		drawer.dataset.v2Ready = '1';
		var drawerOpener = null;
		function openDrawer(event) { drawerOpener = event && event.currentTarget; drawer.classList.add('is-open'); scrim.classList.add('is-open'); drawer.setAttribute('aria-hidden', 'false'); if (drawerOpener) { drawerOpener.setAttribute('aria-expanded', 'true'); } document.body.style.overflow = 'hidden'; var first = drawer.querySelector('button, a[href], input, select'); if (first) { first.focus(); } }
		function closeDrawer() { if (!drawer.classList.contains('is-open')) { return; } drawer.classList.remove('is-open'); scrim.classList.remove('is-open'); drawer.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; if (drawerOpener) { drawerOpener.setAttribute('aria-expanded', 'false'); drawerOpener.focus(); } }
		document.querySelectorAll('[data-v2-drawer-open]').forEach(function (b) { b.addEventListener('click', openDrawer); });
		document.querySelectorAll('[data-v2-drawer-close]').forEach(function (b) { b.addEventListener('click', closeDrawer); });
		document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDrawer(); } });
		drawer.querySelectorAll('[data-v2-acc]').forEach(function (btn) {
			btn.addEventListener('click', function () {
				var group = btn.closest('.sd2-v2-drawer__group');
				var willOpen = !group.classList.contains('is-open');
				group.classList.toggle('is-open', willOpen);
				btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
			});
		});
	}
})();

/* The native Miva sitemap is emitted outside the page template and repeats IDs
   also used by the global footer. Scope and repair only that native module. */
(function () {
	'use strict';

	var sitemap = document.querySelector('body.sd2-v2-sitemap-page > nav.sitemap');
	if (!sitemap || sitemap.dataset.v2Ready) { return; }

	sitemap.querySelectorAll('[id]').forEach(function (control) {
		var oldId = control.id;
		var newId = 'sitemap-' + oldId;
		if (document.getElementById(newId)) { return; }
		control.id = newId;
		sitemap.querySelectorAll('label[for="' + oldId + '"]').forEach(function (label) {
			label.htmlFor = newId;
		});
	});

	sitemap.dataset.v2Ready = '1';
})();

/* BEGIN SD2 HELP FORMS */
(function (root, factory) {
	'use strict';
	var api = factory();
	if (typeof module === 'object' && module.exports) module.exports = api;
	if (root) root.SD2HelpForms = api;
}(typeof window !== 'undefined' ? window : null, function () {
	'use strict';

	function clean(value) { return typeof value === 'string' ? value.trim() : ''; }

	function buildSalesPayload(fields) {
		fields = fields || {};
		return {
			name: clean(fields.name),
			email: clean(fields.email).toLowerCase(),
			phone: clean(fields.phone),
			itemSku: clean(fields.itemSku),
			question: clean(fields.question),
			website: clean(fields.website)
		};
	}

	function buildHelpPayload(form) {
		var payload = {};
		new FormData(form).forEach(function (value, key) {
			if (typeof value === 'string') payload[key] = clean(value);
		});
		if (payload.email) payload.email = payload.email.toLowerCase();
		return payload;
	}

	var HELP_FORM_META = {
		'missing-damaged-parts': {
			subject: 'Missing / Damaged Parts Request', source: 'support',
			fields: [['orderNumber', 'Order Number'], ['itemSku', 'Item / SKU'], ['installed', 'Installed'], ['evidenceUrl', 'Evidence']]
		},
		'returns-exchanges': {
			subject: 'Returns / Exchanges Request', source: 'support',
			fields: [['orderNumber', 'Order Number'], ['itemSku', 'Item / SKU'], ['returnType', 'Return Type'], ['reason', 'Reason'], ['installed', 'Installed'], ['evidenceUrl', 'Evidence']]
		},
		'order-tracking': {
			subject: 'Order Tracking Request', source: 'support',
			fields: [['orderNumber', 'Order Number']]
		},
		'tech-support': {
			subject: 'Parts Tech Support Request', source: 'support',
			fields: [['orderNumber', 'Order Number'], ['itemSku', 'Item / SKU'], ['installed', 'Installed'], ['evidenceUrl', 'Evidence']]
		},
		'warranty-inquiry': {
			subject: 'Warranty Inquiry', source: 'warranty',
			fields: [['orderNumber', 'Order Number'], ['itemSku', 'Item / SKU'], ['evidenceUrl', 'Evidence']]
		},
		'shipping-claim': {
			subject: 'Shipping Protection Claim', source: 'support',
			fields: [['orderNumber', 'Order Number'], ['trackingNumber', 'Tracking Number'], ['ifNumber', 'IF Number'], ['evidenceUrl', 'Evidence']]
		}
	};

	function normalizeHelpPayload(fields, slug) {
		fields = fields || {};
		var meta = HELP_FORM_META[slug] || { subject: 'Help Center Request', source: 'support', fields: [] };
		var lines = [clean(fields.details || fields.question)];
		meta.fields.forEach(function (entry) {
			var value = clean(fields[entry[0]]);
			if (value) lines.push(entry[1] + ': ' + value);
		});
		return {
			name: clean(fields.name),
			email: clean(fields.email).toLowerCase(),
			phone: clean(fields.phone),
			subject: meta.subject,
			message: [lines[0]].concat(lines.length > 1 ? ['',].concat(lines.slice(1)) : []).join('\n'),
			source: meta.source,
			company_website: clean(fields.website)
		};
	}

	function HelpFormError(message, details) {
		this.name = 'HelpFormError';
		this.message = message;
		this.errors = details && (details.fields || details.errors) ? (details.fields || details.errors) : {};
		this.requestId = details && (details.reference || details.requestId) ? (details.reference || details.requestId) : '';
		if (Error.captureStackTrace) Error.captureStackTrace(this, HelpFormError);
	}
	HelpFormError.prototype = Object.create(Error.prototype);
	HelpFormError.prototype.constructor = HelpFormError;

	async function sendSalesInquiry(endpoint, payload, fetchImpl, fallbackEndpoint) {
		fetchImpl = fetchImpl || (typeof fetch === 'function' ? fetch.bind(window) : null);
		if (!fetchImpl) throw new HelpFormError('We could not send your request right now. Please use the backup form.');
		try {
			var response = await fetchImpl(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
				credentials: 'same-origin'
			});
			var body = {};
			try { body = await response.json(); } catch (ignore) {}
			if (response.status === 404 && fallbackEndpoint && fallbackEndpoint !== endpoint) {
				return sendSalesInquiry(fallbackEndpoint, payload, fetchImpl, '');
			}
			if (!response.ok || !body.ok) {
				if (!body.message && !Object.keys(body.fields || body.errors || {}).length && response.status !== 400 && response.status !== 422) {
					throw new HelpFormError('We could not send your request right now. Please use the backup form.');
				}
				throw new HelpFormError(body.message || 'Please check the highlighted fields and try again.', body);
			}
			return { ok: true, requestId: body.reference || body.requestId || '' };
		} catch (error) {
			if (error instanceof HelpFormError) throw error;
			throw new HelpFormError('We could not send your request right now. Please use the backup form.');
		}
	}

	function formValues(form) {
		var raw = buildHelpPayload(form);
		return normalizeHelpPayload(raw, form.dataset.sd2HelpForm || '');
	}

	function clearErrors(form) {
		form.querySelectorAll('[data-field-error]').forEach(function (node) { node.textContent = ''; });
		form.querySelectorAll('[aria-invalid="true"]').forEach(function (node) { node.removeAttribute('aria-invalid'); });
	}

	function showFieldErrors(form, errors) {
		Object.keys(errors || {}).forEach(function (name) {
			var field = form.elements[name];
			var message = form.querySelector('[data-field-error="' + name + '"]');
			if (field) field.setAttribute('aria-invalid', 'true');
			if (message) message.textContent = errors[name];
		});
	}

	function initForm(form) {
		if (form.dataset.sd2Ready) return;
		form.dataset.sd2Ready = '1';
		var endpoint = form.dataset.endpoint || '/api/forms/submit';
		var fallbackEndpoint = form.dataset.fallbackEndpoint || '';
		var submitLabel = form.dataset.submitLabel || 'Send Request';
		var submit = form.querySelector('[data-help-form-submit]');
		var status = form.querySelector('[data-help-form-status]');
		var fields = form.querySelector('[data-help-form-fields]');
		var success = form.querySelector('[data-help-form-success]');
		var reference = form.querySelector('[data-help-form-reference]');
		var fallback = form.querySelector('[data-help-form-fallback]');

		form.addEventListener('submit', async function (event) {
			event.preventDefault();
			clearErrors(form);
			if (!form.checkValidity()) { form.reportValidity(); return; }
			submit.disabled = true;
			submit.setAttribute('aria-busy', 'true');
			submit.textContent = 'Sending request...';
			status.textContent = 'Sending your request securely.';
			status.className = 'sd2-help-form__status is-working';
			if (fallback) fallback.hidden = true;

			try {
				var result = await sendSalesInquiry(endpoint, formValues(form), null, fallbackEndpoint);
				form.reset();
				if (fields) fields.hidden = true;
				if (success) success.hidden = false;
				if (reference) reference.textContent = result.requestId || 'Received';
				status.textContent = '';
				if (success) success.focus();
			} catch (error) {
				showFieldErrors(form, error.errors);
				status.textContent = error.message;
				status.className = 'sd2-help-form__status is-error';
				if (fallback) fallback.hidden = false;
				var firstInvalid = form.querySelector('[aria-invalid="true"]');
				if (firstInvalid) firstInvalid.focus();
			} finally {
				submit.disabled = false;
				submit.removeAttribute('aria-busy');
				submit.textContent = submitLabel;
			}
		});
	}

	function init() {
		if (typeof document === 'undefined') return;
		document.querySelectorAll('[data-sd2-help-form]').forEach(initForm);
	}

	if (typeof document !== 'undefined') {
		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
		else init();
	}

	return { buildHelpPayload: buildHelpPayload, buildSalesPayload: buildSalesPayload, normalizeHelpPayload: normalizeHelpPayload, sendHelpRequest: sendSalesInquiry, sendSalesInquiry: sendSalesInquiry, HelpFormError: HelpFormError, init: init };
}));
/* END SD2 HELP FORMS */

/* Descendant category rollups are assembled in the page template, so Miva's
   native facet component has no direct category rows to filter. Keep the same
   catalog-control experience with real in-page filtering and pagination. */
(function () {
	'use strict';
	var controls = document.querySelector('[data-sd2-rollup-catalog]');
	var grid = document.querySelector('.sd2-v2-pgrid--native');
	if (!controls || !grid) { return; }
	var cards = Array.prototype.slice.call(grid.querySelectorAll('[data-sd2-rollup-product]'));
	if (!cards.length) { return; }
	var brand = controls.querySelector('[data-sd2-rollup-brand]');
	var price = controls.querySelector('[data-sd2-rollup-price]');
	var sort = controls.querySelector('[data-sd2-rollup-sort]');
	var size = controls.querySelector('[data-sd2-rollup-page-size]');
	var count = controls.closest('.sd2-v2-toolbar').querySelector('.sd2-v2-toolbar__count');
	var original = cards.slice();
	var currentPage = 1;
	var brands = {};
	cards.forEach(function (card) {
		var value = (card.dataset.sd2Brand || 'Sinister Diesel').trim();
		card.dataset.sd2Brand = value;
		brands[value] = true;
	});
	Object.keys(brands).sort().forEach(function (value) {
		var option = document.createElement('option'); option.value = value; option.textContent = value; brand.appendChild(option);
	});
	var pagination = document.createElement('nav');
	pagination.className = 'page-links sd2-v2-pagination sd2-v2-pagination--rollup';
	pagination.setAttribute('aria-label', 'Category pagination');
	grid.parentNode.insertBefore(pagination, grid);
	function number(card, key) { return parseFloat(card.dataset[key] || '0') || 0; }
	function paginationTargets(pages) {
		var targets = [1];
		if (currentPage > 2) { targets.push('ellipsis-before'); }
		if (currentPage > 1 && currentPage < pages) { targets.push(currentPage); }
		if (currentPage < pages - 1) { targets.push('ellipsis-after'); }
		if (pages > 1) { targets.push(pages); }
		return targets;
	}
	function appendPageButton(target, label, text) {
		var button = document.createElement('button');
		button.type = 'button';
		button.className = target === currentPage ? 'page-links-active' : 'page-links-inactive';
		button.textContent = text || target;
		button.setAttribute('aria-label', label || ('Go to page ' + target));
		if (target === currentPage) { button.setAttribute('aria-current', 'page'); }
		button.addEventListener('click', function () {
			currentPage = target;
			apply();
			controls.scrollIntoView({behavior:'smooth',block:'start'});
		});
		pagination.appendChild(button);
	}
	function apply() {
		var range = price.value ? price.value.split('-').map(Number) : null;
		var visible = cards.filter(function (card) {
			var amount = number(card, 'sd2Price');
			return (!brand.value || card.dataset.sd2Brand === brand.value) && (!range || (amount >= range[0] && amount < range[1]));
		});
		if (sort.value === 'price-asc') { visible.sort(function (a,b) { return number(a,'sd2Price') - number(b,'sd2Price'); }); }
		else if (sort.value === 'price-desc') { visible.sort(function (a,b) { return number(b,'sd2Price') - number(a,'sd2Price'); }); }
		else if (sort.value === 'name') { visible.sort(function (a,b) { return a.dataset.sd2Name.localeCompare(b.dataset.sd2Name); }); }
		else { visible.sort(function (a,b) { return original.indexOf(a) - original.indexOf(b); }); }
		visible.forEach(function (card) { grid.appendChild(card); });
		cards.forEach(function (card) { card.hidden = true; });
		var perPage = parseInt(size.value, 10);
		var pages = perPage === -1 ? 1 : Math.max(1, Math.ceil(visible.length / perPage));
		currentPage = Math.min(currentPage, pages);
		var start = perPage === -1 ? 0 : (currentPage - 1) * perPage;
		var end = perPage === -1 ? visible.length : start + perPage;
		visible.slice(start, end).forEach(function (card) { card.hidden = false; });
		count.textContent = visible.length + ' products';
		pagination.innerHTML = '';
		if (pages > 1) {
			var title = document.createElement('span'); title.className = 'page-links-title'; title.textContent = 'Page(s):'; pagination.appendChild(title);
			if (currentPage > 1) { appendPageButton(currentPage - 1, 'Previous page', '\u2039'); }
			paginationTargets(pages).forEach(function (target) {
				if (typeof target === 'number') { appendPageButton(target); return; }
				var ellipsis = document.createElement('span');
				ellipsis.className = 'page-links-ellipsis';
				ellipsis.textContent = '\u2026';
				ellipsis.setAttribute('aria-hidden', 'true');
				pagination.appendChild(ellipsis);
			});
			if (currentPage < pages) { appendPageButton(currentPage + 1, 'Next page', '\u203a'); }
		}
	}
	[brand, price, sort, size].forEach(function (field) { field.addEventListener('change', function () { currentPage = 1; apply(); }); });
	apply();
})();

/* Mega menu controller — single delegated instance, moves the mount's markup
   into the header's [data-v2-mega-mount] so it renders inside the nav row
   (required for absolute positioning against the full nav width), then wires
   hover-intent + keyboard behavior against the header's existing triggers. */
(function () {
	'use strict';
	var mount = document.querySelector('[data-v2-mega-mount]');
	var mega = document.querySelector('[data-v2-mega]');
	if (!mount || !mega || mega.dataset.v2Ready) { return; }
	mega.dataset.v2Ready = '1';
	mount.appendChild(mega);

	var root = document.querySelector('[data-v2-menu-root]');
	if (!root) { return; }
	var triggers = Array.prototype.slice.call(root.querySelectorAll('[data-v2-menu-trigger]'));
	var panels = Array.prototype.slice.call(mega.querySelectorAll('[data-v2-panel]'));
	var closeTimer = 0;
	var openTimer = 0;
	var current = null;
	panels.forEach(function (panel, index) {
		if (!panel.id) { panel.id = 'sd2-v2-mega-panel-' + (panel.getAttribute('data-v2-panel') || (index + 1)); }
	});
	triggers.forEach(function (trigger) {
		var panel = mega.querySelector('[data-v2-panel="' + trigger.getAttribute('data-v2-menu-trigger') + '"]');
		if (panel) { trigger.setAttribute('aria-controls', panel.id); }
	});

	function activate(id) {
		window.clearTimeout(openTimer);
		window.clearTimeout(closeTimer);
		var matched = false;
		panels.forEach(function (p) { var on = p.getAttribute('data-v2-panel') === id; p.classList.toggle('is-active', on); matched = matched || on; });
		triggers.forEach(function (t) {
			var on = t.getAttribute('data-v2-menu-trigger') === id;
			t.setAttribute('aria-expanded', on ? 'true' : 'false');
			t.closest('.sd2-v2-hdr-nav__item').classList.toggle('is-open', on);
		});
		if (matched) { root.classList.add('is-open'); current = id; } else { close(); }
	}
	function close() {
		window.clearTimeout(openTimer);
		window.clearTimeout(closeTimer);
		root.classList.remove('is-open'); current = null;
		panels.forEach(function (p) { p.classList.remove('is-active'); });
		triggers.forEach(function (t) { t.setAttribute('aria-expanded', 'false'); t.closest('.sd2-v2-hdr-nav__item').classList.remove('is-open'); });
	}
	function activateSoon(id) {
		window.clearTimeout(openTimer);
		window.clearTimeout(closeTimer);
		openTimer = window.setTimeout(function () { activate(id); }, current ? 70 : 130);
	}
	function closeSoon() {
		window.clearTimeout(openTimer);
		window.clearTimeout(closeTimer);
		closeTimer = window.setTimeout(close, 190);
	}

	triggers.forEach(function (t) {
		var id = t.getAttribute('data-v2-menu-trigger');
		t.addEventListener('mouseenter', function () { activateSoon(id); });
		t.addEventListener('focus', function () { activate(id); });
		t.addEventListener('click', function (e) { e.preventDefault(); (current === id) ? close() : activate(id); });
		t.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (current === id) ? close() : activate(id); } });
		t.addEventListener('mouseleave', closeSoon);
	});
	mega.addEventListener('mouseenter', function () { window.clearTimeout(openTimer); window.clearTimeout(closeTimer); });
	mega.addEventListener('mouseleave', closeSoon);
	document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); } });
	document.addEventListener('click', function (e) { if (!root.contains(e.target)) { close(); } });
})();

/* Search Console open/close + local-only recent-search memory (no server
   round trip; purely a frontend convenience against localStorage). */
(function () {
	'use strict';
	var root = document.querySelector('[data-v2-search]');
	if (!root || root.dataset.v2Ready) { return; }
	root.dataset.v2Ready = '1';
	var console_ = root.querySelector('.sd2-v2-search-console');
	var scrim = root.querySelector('.sd2-v2-search-scrim');
	var input = root.querySelector('[data-v2-search-input]');
	var form = root.querySelector('form');
	var header = document.querySelector('.sd2-v2-hdr');
	var empty = root.querySelector('[data-v2-search-empty]');
	var opener = null;

	function positionConsole() {
		var bottom = header ? Math.max(0, Math.round(header.getBoundingClientRect().bottom)) : 0;
		console_.style.setProperty('--sd2-search-top', bottom + 'px');
	}
	function syncEmptyState() {
		if (empty && input) { empty.hidden = Boolean((input.value || '').trim()); }
	}

	function open(event) {
		opener = event && event.currentTarget ? event.currentTarget : document.querySelector('[data-v2-search-open]');
		if (opener) { opener.setAttribute('aria-expanded', 'true'); }
		positionConsole();
		syncEmptyState();
		console_.classList.add('is-open'); scrim.classList.add('is-open');
		console_.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden';
		window.setTimeout(function () { input.focus(); }, 200);
	}
	function close() {
		if (!console_.classList.contains('is-open')) { return; }
		console_.classList.remove('is-open'); scrim.classList.remove('is-open');
		console_.setAttribute('aria-hidden', 'true'); document.body.style.overflow = '';
		if (opener) { opener.setAttribute('aria-expanded', 'false'); opener.focus(); }
	}

	document.querySelectorAll('[data-v2-search-open]').forEach(function (b) { b.addEventListener('click', open); });
	root.querySelectorAll('[data-v2-search-close]').forEach(function (b) { b.addEventListener('click', close); });
	document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); } });
	window.addEventListener('resize', function () { if (console_.classList.contains('is-open')) { positionConsole(); } }, { passive: true });
	if (input) { input.addEventListener('input', syncEmptyState); }
	if (form && input) {
		form.addEventListener('submit', function () {
			var term = (input.value || '').trim();
			if (!term) { return; }
			try {
				var recentSearches = JSON.parse(window.localStorage.getItem('sd2v2_recent_searches') || '[]');
				recentSearches = recentSearches.filter(function (item) { return item !== term; });
				recentSearches.unshift(term);
				window.localStorage.setItem('sd2v2_recent_searches', JSON.stringify(recentSearches.slice(0, 5)));
			} catch (e) { /* localStorage unavailable; allow native search submit */ }
		});
	}

	try {
		var recent = JSON.parse(window.localStorage.getItem('sd2v2_recent_searches') || '[]');
		if (recent.length) {
			var wrap = root.querySelector('[data-v2-search-recent]');
			var list = root.querySelector('[data-v2-search-recent-list]');
			recent.slice(0, 5).forEach(function (term) {
				var a = document.createElement('a');
				a.className = 'sd2-v2-search-console__recent-item'; a.href = '#'; a.textContent = term;
				a.addEventListener('click', function (e) { e.preventDefault(); input.value = term; input.focus(); });
				list.appendChild(a);
			});
			wrap.hidden = false;
		}
	} catch (e) { /* localStorage unavailable; recent searches simply don't render */ }
})();

/* Live listing layout guard. Some CTGY/SRCH pages can render the revamp shell
   before Miva outputs any actual facet controls, leaving an empty 280px rail
   that creates inconsistent whitespace between otherwise identical categories.
   Normalize the rendered state from the DOM so empty filter rails collapse to
   the same one-column grid used by single-product/no-facet categories. */
(function () {
	'use strict';
	function railHasContent(rail) {
		if (!rail) { return false; }
		return !!rail.querySelector('.x-refinery, .x-refinery-set, .x-category-tree, .c-form-checkbox, .c-form-select__dropdown, input[type="checkbox"], select');
	}

	function syncLayout(layout) {
		if (!layout) { return; }
		var rail = layout.querySelector(':scope > .sd2-v2-filter-rail, :scope > .sd2-v2-filter-panel');
		var hasFilters = railHasContent(rail);
		layout.classList.toggle('sd2-v2-search-page__layout--has-filters', hasFilters);
		layout.classList.toggle('sd2-v2-search-page__layout--no-filters', !hasFilters);
		if (rail) {
			rail.hidden = !hasFilters;
		}
	}

	document.querySelectorAll('.sd2-v2-search-page__layout').forEach(function (layout) {
		syncLayout(layout);
		var rail = layout.querySelector(':scope > .sd2-v2-filter-rail, :scope > .sd2-v2-filter-panel');
		if (!rail || typeof MutationObserver === 'undefined') { return; }
		var observer = new MutationObserver(function () { syncLayout(layout); });
		observer.observe(rail, { childList: true, subtree: true });
	});
})();

/* Garage Experience V2 controller — panel open/close, cascading select
   enable/disable, and local persistence (localStorage) so the Vehicle
   Profile card and header trigger reflect the active vehicle across page
   loads. Real fitment matching against Miva product/category data is
   explicitly deferred to a later milestone per this milestone's scope. */
(function () {
	'use strict';
	var root = document.querySelector('[data-v2-garage]');
	if (!root || root.dataset.v2Ready) { return; }
	root.dataset.v2Ready = '1';
	/* Header templates own the markup, but overlays must not remain trapped in
	   the sticky header's stacking context on mobile. */
	document.body.appendChild(root);

	var panel = root.querySelector('.sd2-v2-garage-panel');
	var scrim = root.querySelector('.sd2-v2-garage-scrim');
	var form = root.querySelector('[data-v2-garage-form]');
	var makeSel = root.querySelector('[data-v2-garage-field="make"]');
	var engineSel = root.querySelector('[data-v2-garage-field="engine"]');
	var yearSel = root.querySelector('[data-v2-garage-field="year"]');
	var cardEmpty = root.querySelector('[data-v2-garage-card-empty]');
	var cardName = root.querySelector('[data-v2-garage-card-name]');
	var cardSpec = root.querySelector('[data-v2-garage-card-spec]');
	var shopButton = root.querySelector('[data-v2-garage-shop]');
	var shopLabel = root.querySelector('[data-v2-garage-shop-label]');

	var ENGINE_DATA = {
		Ford: [
			{ name: '6.7 Powerstroke', from: 2011, to: 2026 },
			{ name: '6.4 Powerstroke', from: 2008, to: 2010 },
			{ name: '6.0 Powerstroke', from: 2003, to: 2007 },
			{ name: '7.3 Powerstroke', from: 1994, to: 2003 }
		],
		GM: [
			{ name: 'Duramax L5P', from: 2017, to: 2026 },
			{ name: 'Duramax LML', from: 2011, to: 2016 },
			{ name: 'Duramax LMM', from: 2007, to: 2010 },
			{ name: 'Duramax LBZ', from: 2006, to: 2007 },
			{ name: 'Duramax LLY', from: 2004, to: 2005 },
			{ name: 'Duramax LB7', from: 2001, to: 2004 }
		],
		'Dodge / Ram': [
			{ name: '6.7 Cummins', from: 2007, to: 2026 },
			{ name: '5.9 Cummins', from: 1994, to: 2007 }
		]
	};

	function findEngine(make, engine) {
		return (ENGINE_DATA[make] || []).filter(function (item) { return item.name === engine; })[0] || null;
	}
	function yearsFor(make, engine) {
		var data = findEngine(make, engine);
		var years = [];
		if (!data) { return years; }
		for (var year = data.to; year >= data.from; year -= 1) { years.push(String(year)); }
		return years;
	}
	function vehicleLabel(vehicle) {
		return vehicle ? [vehicle.year, vehicle.make, vehicle.engine].filter(Boolean).join(' ') : '';
	}
	function vehicleSearchUrl(vehicle) {
		var searchForm = document.querySelector('[data-v2-search] form');
		var action = searchForm && searchForm.action ? searchForm.action : '/search.html';
		var url = new URL(action, window.location.origin);
		url.searchParams.set('Search', vehicle.engine);
		url.searchParams.set('source', 'garage');
		url.searchParams.set('garage_year', vehicle.year);
		url.searchParams.set('garage_make', vehicle.make);
		url.searchParams.set('garage_engine', vehicle.engine);
		var branchKey = new URL(window.location.href).searchParams.get('BranchKey');
		if (branchKey) { url.searchParams.set('BranchKey', branchKey); }
		return url.toString();
	}
	function syncShopButton(vehicle) {
		if (!shopButton) { return; }
		shopButton.hidden = !vehicle;
		if (!vehicle) { return; }
		shopButton.href = vehicleSearchUrl(vehicle);
		if (shopLabel) { shopLabel.textContent = vehicleLabel(vehicle); }
	}

	function closeCompetingPanels() {
		document.querySelectorAll('[data-v2-drawer], .sd2-v2-cart-drawer, .sd2-v2-search-console').forEach(function (item) {
			item.classList.remove('is-open');
			if (item.hasAttribute('aria-hidden')) { item.setAttribute('aria-hidden', 'true'); }
		});
		document.querySelectorAll('[data-v2-search-open], [data-v2-cart-open]').forEach(function (item) { item.setAttribute('aria-expanded', 'false'); });
		document.querySelectorAll('.sd2-v2-scrim, .sd2-v2-cart-scrim, .sd2-v2-search-scrim').forEach(function (item) {
			item.classList.remove('is-open');
		});
	}
	var opener = null;
	function open(toggle) {
		opener = toggle || document.querySelector('[data-v2-garage-toggle]');
		closeCompetingPanels();
		panel.classList.add('is-open'); scrim.classList.add('is-open');
		panel.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden';
		document.querySelectorAll('[data-v2-garage-toggle]').forEach(function (item) { item.setAttribute('aria-expanded', 'true'); });
		var firstControl = panel.querySelector('[data-v2-garage-close], select, button, a');
		if (firstControl) { firstControl.focus(); }
	}
	function close() {
		if (!panel.classList.contains('is-open')) { return; }
		panel.classList.remove('is-open'); scrim.classList.remove('is-open'); panel.setAttribute('aria-hidden', 'true'); document.body.style.overflow = '';
		document.querySelectorAll('[data-v2-garage-toggle]').forEach(function (item) { item.setAttribute('aria-expanded', 'false'); });
		if (opener) { opener.focus(); }
	}

	document.addEventListener('click', function (event) {
		var toggle = event.target.closest('[data-v2-garage-toggle]');
		if (!toggle) { return; }
		event.preventDefault();
		panel.classList.contains('is-open') ? close() : open(toggle);
	});
	root.querySelectorAll('[data-v2-garage-close]').forEach(function (b) { b.addEventListener('click', close); });
	document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); } });

	function fillSelect(sel, items, placeholder) {
		sel.innerHTML = '';
		var opt0 = document.createElement('option'); opt0.value = ''; opt0.textContent = placeholder; sel.appendChild(opt0);
		items.forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
		sel.disabled = items.length === 0;
	}

	makeSel.addEventListener('change', function () {
		var list = (ENGINE_DATA[makeSel.value] || []).map(function (item) { return item.name; });
		fillSelect(engineSel, list, list.length ? 'Select Engine' : 'Select Make First');
		fillSelect(yearSel, [], 'Select Engine First');
	});
	engineSel.addEventListener('change', function () {
		var years = yearsFor(makeSel.value, engineSel.value);
		fillSelect(yearSel, years, years.length ? 'Select Year' : 'Select Engine First');
	});

	function renderActiveVehicle(vehicle) {
		var headerLabel = document.querySelectorAll('[data-v2-garage-label]');
		if (!vehicle) {
			cardEmpty.hidden = false; cardName.hidden = true; cardSpec.hidden = true;
			headerLabel.forEach(function (el) { el.textContent = 'Add Your Truck'; el.classList.add('is-empty'); });
			syncShopButton(null);
			return;
		}
		cardEmpty.hidden = true;
		cardName.hidden = false; cardName.textContent = vehicle.make + ' ' + vehicle.engine;
		cardSpec.hidden = false; cardSpec.textContent = vehicle.year + ' / fitment search ready';
		headerLabel.forEach(function (el) { el.textContent = vehicle.year + ' ' + vehicle.make; el.classList.remove('is-empty'); });
		syncShopButton(vehicle);
	}

	function loadVehicles() { try { return JSON.parse(window.localStorage.getItem('sd2v2_garage') || '[]'); } catch (e) { return []; } }
	function saveVehicles(list) { try { window.localStorage.setItem('sd2v2_garage', JSON.stringify(list)); } catch (e) { /* storage unavailable */ } window.dispatchEvent(new CustomEvent('sd2v2:garage-change')); }

	function renderSaved() {
		var list = loadVehicles();
		var wrap = root.querySelector('[data-v2-garage-saved-wrap]');
		var container = root.querySelector('[data-v2-garage-saved-list]');
		container.innerHTML = '';
		wrap.hidden = list.length === 0;
		list.forEach(function (v, i) {
			var row = document.createElement('div');
			row.className = 'sd2-v2-garage-saved__item';
			var label = document.createElement('span'); label.textContent = v.year + ' ' + v.make + ' ' + v.engine;
			var view = document.createElement('a'); view.textContent = 'View Parts'; view.href = vehicleSearchUrl(v); view.className = 'sd2-v2-garage-saved__view';
			var btn = document.createElement('button'); btn.type = 'button'; btn.textContent = 'Remove'; btn.className = 'sd2-v2-garage-saved__remove'; btn.setAttribute('aria-label', 'Remove ' + vehicleLabel(v) + ' from saved vehicles');
			btn.addEventListener('click', function () { list.splice(i, 1); saveVehicles(list); renderSaved(); if (i === 0) { renderActiveVehicle(list[0] || null); } });
			row.appendChild(label); row.appendChild(view); row.appendChild(btn); container.appendChild(row);
		});
	}

	form.addEventListener('submit', function (e) {
		e.preventDefault();
		if (!makeSel.value || !engineSel.value || !yearSel.value) { return; }
		var vehicle = { make: makeSel.value, engine: engineSel.value, year: yearSel.value };
		var list = loadVehicles().filter(function (item) { return vehicleLabel(item) !== vehicleLabel(vehicle); });
		list.unshift(vehicle); saveVehicles(list);
		renderActiveVehicle(vehicle); renderSaved(); panel.classList.add('has-active-vehicle');
	});

	var existing = loadVehicles();
	renderActiveVehicle(existing[0] || null);
	panel.classList.toggle('has-active-vehicle', !!existing[0]);
	renderSaved();
})();

/* Cart Drawer controller — open/close + reads the Garage Experience's
   localStorage vehicle so the reminder strip reflects the active truck.
   Shipping progress bar uses a placeholder threshold pending real order
   total wiring in the Cart & Checkout milestone. */
(function () {
	'use strict';
	var root = document.querySelector('[data-v2-cart]');
	if (!root || root.dataset.v2Ready) { return; }
	root.dataset.v2Ready = '1';
	var panel = root.querySelector('.sd2-v2-cart-panel');
	var scrim = root.querySelector('.sd2-v2-cart-scrim');
	var vehicleBox = root.querySelector('[data-v2-cart-vehicle]');
	var vehicleText = root.querySelector('[data-v2-cart-vehicle-text]');
	var vehicleAction = vehicleBox && vehicleBox.querySelector('a');
	var body = root.querySelector('.sd2-v2-cart-panel__body');
	var foot = root.querySelector('.sd2-v2-cart-panel__foot');
	var basketUrl = foot && foot.querySelector('a') ? foot.querySelector('a').href : '/basket-contents.html';
	var cartRequest = null;
	var cartLoadedAt = 0;

	function cartEscape(value) {
		return String(value || '')
			.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	}

	function renderLiveBasket(basketData) {
		if (!basketData || !body) { return; }
		var count = parseInt(basketData.getAttribute('data-item-count') || '0', 10) || 0;
		var subtotalText = basketData.getAttribute('data-subtotal') || '$0.00';
		document.querySelectorAll('[data-hook~="mini-basket-count"]').forEach(function (node) { node.textContent = String(count); });
		var subtotal = root.querySelector('[data-v2-cart-subtotal]');
		if (subtotal) { subtotal.textContent = subtotalText; }

		if (!count) {
			body.innerHTML = '<div class="sd2-v2-cart-empty" data-v2-cart-empty><span class="sd2-v2-cart-empty__mark" aria-hidden="true">0</span><p class="sd2-v2-cart-empty__title">Your Build Starts Here.</p><p class="sd2-v2-cart-empty__copy">Choose your truck, then add fitment-confirmed parts with confidence.</p><a class="sd2-btn sd2-btn--primary sd2-btn--full" href="/">Explore Parts</a></div>';
			syncCartContents();
			return;
		}

		var lines = Array.prototype.slice.call(basketData.querySelectorAll('.x-mini-basket__line')).map(function (line) {
			var image = line.querySelector('.x-mini-basket__image img');
			var name = line.querySelector('.x-mini-basket__item-name');
			var price = line.querySelector('.x-mini-basket__item-price');
			var qty = line.querySelector('.x-mini-basket__item-quantity .u-text-medium');
			var quantity = Math.max(1, parseInt(qty ? qty.textContent.trim() : '1', 10) || 1);
			var basketGroup = line.getAttribute('data-basket-group') || '';
			var remove = line.querySelector('.x-mini-basket__item-total a[href*="Action=RPRD"], .x-mini-basket__item-total a[href*="Action=RGRP"]');
			var options = Array.prototype.slice.call(line.querySelectorAll('.x-mini-basket__item-attributes')).map(function (option) {
				return '<p class="sd2-v2-cart-item__option">' + cartEscape((option.textContent || '').trim()) + '</p>';
			}).join('');
			var href = name ? name.getAttribute('href') : '#';
			var itemName = name ? name.textContent.trim() : 'cart item';
			var quantityControl = basketGroup ? '<form class="sd2-v2-cart-qty" data-v2-cart-qty data-basket-group="' + cartEscape(basketGroup) + '"><button type="button" data-v2-cart-qty-minus aria-label="Decrease quantity for ' + cartEscape(itemName) + '">−</button><input type="number" min="0" inputmode="numeric" value="' + quantity + '" aria-label="Quantity for ' + cartEscape(itemName) + '" data-v2-cart-qty-input><button type="button" data-v2-cart-qty-plus aria-label="Increase quantity for ' + cartEscape(itemName) + '">+</button></form>' : '<p class="sd2-v2-cart-item__meta">Qty ' + quantity + '</p>';
			return '<article class="sd2-v2-cart-item"><a class="sd2-v2-cart-item__media" href="' + cartEscape(href) + '"><img src="' + cartEscape(image ? image.getAttribute('src') : '') + '" alt="' + cartEscape(image ? image.getAttribute('alt') : '') + '" loading="lazy"></a><div class="sd2-v2-cart-item__body"><h3><a href="' + cartEscape(href) + '">' + cartEscape(itemName) + '</a></h3>' + quantityControl + options + (remove ? '<a class="sd2-v2-link-button" href="' + cartEscape(remove.getAttribute('href')) + '">Remove</a>' : '') + '</div><strong class="sd2-v2-cart-item__price">' + cartEscape(price ? price.textContent.trim() : '') + '</strong></article>';
		}).join('');

		if (lines) {
			body.innerHTML = '<div class="sd2-v2-cart-lines" data-v2-cart-items>' + lines + '</div>';
			root.classList.remove('is-empty');
			if (foot) { foot.hidden = false; }
		}
	}

	function renderLiveCartDocument(doc) {
		var miniBasket = doc.querySelector('[data-hook="mini-basket"]');
		if (miniBasket) { renderLiveBasket(miniBasket); return true; }

		/* Runtime branch BASK pages use the redesigned drawer/listing markup and
		   intentionally omit the legacy mini-basket content section. */
		var liveLines = doc.querySelector('[data-v2-cart-items]');
		var liveCount = doc.querySelector('.sd2-v2-cart-panel__head [data-hook~="mini-basket-count"]');
		var liveSubtotal = doc.querySelector('.sd2-v2-cart-panel [data-v2-cart-subtotal]');
		var count = parseInt(liveCount ? liveCount.textContent : '0', 10) || 0;
		if (!count && liveLines) {
			count = Array.prototype.slice.call(liveLines.querySelectorAll('.sd2-v2-cart-item')).reduce(function (total, item) {
				var match = (item.textContent || '').match(/Qty\s+(\d+)/i);
				return total + (match ? parseInt(match[1], 10) : 1);
			}, 0);
		}
		document.querySelectorAll('[data-hook~="mini-basket-count"]').forEach(function (node) { node.textContent = String(count); });
		var subtotal = root.querySelector('[data-v2-cart-subtotal]');
		if (subtotal) { subtotal.textContent = liveSubtotal ? liveSubtotal.textContent.trim() : '$0.00'; }

		if (count && liveLines) {
			body.innerHTML = liveLines.outerHTML;
			root.classList.remove('is-empty');
			if (foot) { foot.hidden = false; }
			return true;
		}
		if (!count) {
			body.innerHTML = '<div class="sd2-v2-cart-empty" data-v2-cart-empty><span class="sd2-v2-cart-empty__mark" aria-hidden="true">0</span><p class="sd2-v2-cart-empty__title">Your Build Starts Here.</p><p class="sd2-v2-cart-empty__copy">Choose your truck, then add fitment-confirmed parts with confidence.</p><a class="sd2-btn sd2-btn--primary sd2-btn--full" href="/">Explore Parts</a></div>';
			syncCartContents();
			return true;
		}
		return false;
	}

	function loadLiveCart(force) {
		if (!force && Date.now() - cartLoadedAt < 15000) { return Promise.resolve(); }
		if (cartRequest) { return cartRequest; }
		root.classList.add('is-loading');
		var requestUrl = new URL(basketUrl, window.location.origin);
		requestUrl.searchParams.set('ajax', '1');
		cartRequest = fetch(requestUrl.toString(), { credentials: 'same-origin' })
			.then(function (response) { if (!response.ok) { throw new Error('Basket request failed'); } return response.text(); })
			.then(function (html) {
				var doc = new DOMParser().parseFromString(html, 'text/html');
				renderLiveCartDocument(doc);
				cartLoadedAt = Date.now();
			})
			.catch(function () { /* Keep the server-rendered drawer if live hydration is unavailable. */ })
			.finally(function () { cartRequest = null; root.classList.remove('is-loading'); });
		return cartRequest;
	}

	function updateDrawerQuantity(control, delta) {
		var input = control.querySelector('[data-v2-cart-qty-input]');
		var basketGroup = control.getAttribute('data-basket-group');
		if (!input || !basketGroup || root.classList.contains('is-loading')) { return; }
		var minimum = parseInt(input.getAttribute('min') || '0', 10);
		var current = parseInt(input.value || '1', 10) || 1;
		var next = Math.max(minimum, current + delta);
		if (next === current) { return; }
		input.value = String(next);
		root.classList.add('is-loading');
		var payload = new URLSearchParams();
		payload.set('Action', 'QTYG');
		payload.set('Basket_Group', basketGroup);
		payload.set('Quantity', String(next));
		payload.set('Screen', 'BASK');
		payload.set('ajax', '1');
		fetch(basketUrl, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
			body: payload.toString()
		})
			.then(function (response) { if (!response.ok) { throw new Error('Quantity update failed'); } return response.text(); })
			.then(function (html) {
				var doc = new DOMParser().parseFromString(html, 'text/html');
				if (!renderLiveCartDocument(doc)) { throw new Error('Quantity response was incomplete'); }
				cartLoadedAt = Date.now();
			})
			.catch(function () { input.value = String(current); window.location.href = basketUrl; })
			.finally(function () { root.classList.remove('is-loading'); });
	}

	root.addEventListener('click', function (event) {
		var button = event.target.closest('[data-v2-cart-qty-minus], [data-v2-cart-qty-plus]');
		if (!button || !root.contains(button)) { return; }
		event.preventDefault();
		var control = button.closest('[data-v2-cart-qty]');
		if (control) { updateDrawerQuantity(control, button.hasAttribute('data-v2-cart-qty-plus') ? 1 : -1); }
	});

	function syncCartContents() {
		var items = body ? body.querySelectorAll('.sd2-v2-cart-item') : [];
		var empty = !items.length;
		root.classList.toggle('is-empty', empty);
		if (empty && body && !body.querySelector('[data-v2-cart-empty]')) {
			var state = document.createElement('div');
			state.className = 'sd2-v2-cart-empty';
			state.setAttribute('data-v2-cart-empty', '');
			state.innerHTML = '<span class="sd2-v2-cart-empty__mark" aria-hidden="true">0</span><p class="sd2-v2-cart-empty__title">Your build starts here.</p><p class="sd2-v2-cart-empty__copy">Choose your truck, then add fitment-confirmed parts with confidence.</p><a class="sd2-btn sd2-btn--primary sd2-btn--full" href="/">Explore Parts</a>';
			body.replaceChildren(state);
		}
		if (foot) { foot.hidden = empty; }
		root.querySelectorAll('.sd2-v2-cart-panel__head [data-hook="mini-basket-count"]').forEach(function (count) {
			if (empty && !(count.textContent || '').trim()) { count.textContent = '0'; }
		});
	}

	function cartVehicleSearchUrl(vehicle) {
		var url = new URL('/search.html', window.location.origin);
		url.searchParams.set('Search', vehicle.engine);
		url.searchParams.set('source', 'garage');
		url.searchParams.set('garage_year', vehicle.year);
		url.searchParams.set('garage_make', vehicle.make);
		url.searchParams.set('garage_engine', vehicle.engine);
		var branchKey = new URL(window.location.href).searchParams.get('BranchKey');
		if (branchKey) { url.searchParams.set('BranchKey', branchKey); }
		return url.toString();
	}

	var opener = null;
	function open(toggle) {
		opener = toggle || document.querySelector('[data-v2-cart-open]');
		syncCartContents();
		loadLiveCart(true);
		panel.classList.add('is-open'); scrim.classList.add('is-open');
		panel.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden';
		if (opener) { opener.setAttribute('aria-expanded', 'true'); }
		var closeButton = panel.querySelector('[data-v2-cart-close]');
		if (closeButton) { closeButton.focus(); }
		refreshVehicle();
	}
	function close() {
		if (!panel.classList.contains('is-open')) { return; }
		panel.classList.remove('is-open'); scrim.classList.remove('is-open'); panel.setAttribute('aria-hidden', 'true'); document.body.style.overflow = '';
		if (opener) { opener.setAttribute('aria-expanded', 'false'); opener.focus(); }
	}

	function refreshVehicle() {
		try {
			var list = JSON.parse(window.localStorage.getItem('sd2v2_garage') || '[]');
			if (list[0]) {
				vehicleBox.classList.remove('is-empty');
				vehicleText.textContent = 'Fits your ' + list[0].year + ' ' + list[0].make + ' ' + list[0].engine;
				if (vehicleAction) {
					vehicleAction.textContent = 'View Parts'; vehicleAction.href = cartVehicleSearchUrl(list[0]);
					vehicleAction.removeAttribute('data-v2-garage-toggle');
				}
			} else {
				vehicleBox.classList.add('is-empty');
				vehicleText.textContent = 'Add your truck to confirm fitment';
				if (vehicleAction) {
					vehicleAction.textContent = 'Add'; vehicleAction.href = '#'; vehicleAction.setAttribute('data-v2-garage-toggle', '');
				}
			}
		} catch (e) { /* storage unavailable; reminder stays in empty state */ }
	}

	document.querySelectorAll('[data-v2-cart-open]').forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); open(b); }); });
	root.querySelectorAll('[data-v2-cart-close]').forEach(function (b) { b.addEventListener('click', close); });
	document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); } });
	syncCartContents();
	loadLiveCart(false);
})();

/* Customer Dashboard V2. Inactive account enhancements for Garage previews
   and optional account section disclosure. */
(function () {
	'use strict';
	var accountRoot = document.querySelector('[data-v2-account]');
	if (!accountRoot) { return; }
	function loadGarage() {
		try {
			return JSON.parse(window.localStorage.getItem('sd2v2_garage') || '[]');
		} catch (e) {
			return [];
		}
	}
	function vehicleLabel(vehicle) {
		return [vehicle.year, vehicle.make, vehicle.model, vehicle.engine].filter(Boolean).join(' ');
	}
	function accountVehicleSearchUrl(vehicle) {
		var url = new URL('/search.html', window.location.origin);
		url.searchParams.set('Search', vehicle.engine);
		url.searchParams.set('source', 'garage');
		url.searchParams.set('garage_year', vehicle.year);
		url.searchParams.set('garage_make', vehicle.make);
		url.searchParams.set('garage_engine', vehicle.engine);
		var branchKey = new URL(window.location.href).searchParams.get('BranchKey');
		if (branchKey) { url.searchParams.set('BranchKey', branchKey); }
		return url.toString();
	}
	function renderGarage() {
		var vehicles = loadGarage();
		document.querySelectorAll('[data-v2-account-garage-copy]').forEach(function (node) {
			node.textContent = vehicles[0] ? vehicleLabel(vehicles[0]) : 'No active vehicle selected.';
		});
		document.querySelectorAll('[data-v2-account-garage-list]').forEach(function (list) {
			if (list.dataset.v2AccountManual) { return; }
			if (!vehicles.length) {
				list.innerHTML = '<p>No saved vehicles yet. Add a truck in Garage to personalize fitment.</p>';
				return;
			}
			list.innerHTML = '';
			vehicles.forEach(function (vehicle, index) {
				var card = document.createElement('article');
				card.className = 'sd2-v2-account-vehicle-card' + (index === 0 ? ' is-active' : '');
				card.innerHTML = '<strong></strong><span></span><div><span class="sd2-v2-badge sd2-v2-badge--fitment"></span><a class="sd2-v2-link-button" data-v2-account-view-parts>View Parts</a><button class="sd2-v2-link-button" type="button" data-v2-garage-toggle>Edit</button></div>';
				card.querySelector('strong').textContent = vehicleLabel(vehicle) || 'Saved Vehicle';
				card.querySelector('span').textContent = index === 0 ? 'Active vehicle' : 'Saved vehicle';
				card.querySelector('.sd2-v2-badge').textContent = index === 0 ? 'Active' : 'Saved';
				card.querySelector('[data-v2-account-view-parts]').href = accountVehicleSearchUrl(vehicle);
				list.appendChild(card);
			});
		});
	}
	document.querySelectorAll('[data-v2-account-section-toggle]').forEach(function (toggle) {
		var target = document.getElementById(toggle.getAttribute('aria-controls') || '');
		if (!target) { return; }
		toggle.addEventListener('click', function () {
			var open = toggle.getAttribute('aria-expanded') === 'true';
			toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
			target.hidden = open;
		});
	});
	renderGarage();
	window.addEventListener('storage', function (event) {
		if (event.key === 'sd2v2_garage') { renderGarage(); }
	});
})();

/* Cart + Checkout V2. Inactive flow enhancements for reusable partials:
   mobile summary disclosure, editable sections, selectable cards, and cart progress. */
(function () {
	'use strict';
	document.querySelectorAll('[data-v2-mobile-checkout]').forEach(function (root) {
		if (root.dataset.v2Ready) { return; }
		root.dataset.v2Ready = '1';
		var toggle = root.querySelector('[data-v2-mobile-summary-toggle]');
		var summary = root.querySelector('[data-v2-mobile-summary]');
		if (!toggle || !summary) { return; }
		toggle.addEventListener('click', function () {
			var open = toggle.getAttribute('aria-expanded') === 'true';
			toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
			summary.hidden = open;
		});
	});

	document.querySelectorAll('[data-v2-editable-section]').forEach(function (section) {
		if (section.dataset.v2Ready) { return; }
		section.dataset.v2Ready = '1';
		var toggle = section.querySelector('[data-v2-editable-toggle]');
		var body = section.querySelector('[data-v2-editable-body]');
		if (!toggle || !body) { return; }
		toggle.setAttribute('aria-expanded', 'true');
		toggle.addEventListener('click', function () {
			var open = toggle.getAttribute('aria-expanded') === 'true';
			toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
			body.hidden = open;
		});
	});

	document.querySelectorAll('.sd2-v2-address-card, .sd2-v2-method-card, .sd2-v2-payment-card').forEach(function (card) {
		var input = card.querySelector('input[type="radio"]');
		if (!input || !input.name) { return; }
		function refresh() { card.classList.toggle('is-selected', input.checked); }
		input.addEventListener('change', function () {
			document.querySelectorAll('input[name="' + input.name + '"]').forEach(function (item) {
				var parent = item.closest('.sd2-v2-address-card, .sd2-v2-method-card, .sd2-v2-payment-card');
				if (parent) { parent.classList.toggle('is-selected', item.checked); }
			});
		});
		refresh();
	});

})();

/* Listing Filter Sheet V2. Mobile-only bottom sheet for existing filter rail markup. */
(function () {
	'use strict';
	var sheet = document.querySelector('[data-v2-filter-sheet]');
	if (!sheet || sheet.dataset.v2Ready) { return; }
	sheet.dataset.v2Ready = '1';
	var openers = Array.prototype.slice.call(document.querySelectorAll('[data-v2-filter-open]'));
	var closers = Array.prototype.slice.call(document.querySelectorAll('[data-v2-filter-close]'));
	var scrim = document.querySelector('.sd2-v2-filter-sheet-scrim');
	/* Descendant rollups already provide local Brand, Price, Fitment, Sort and
	   View controls. Never mount a second native facet surface beside them. */
	if (document.querySelector('[data-sd2-rollup-catalog]')) {
		sheet.hidden = true;
		if (scrim) { scrim.hidden = true; }
		openers.forEach(function (button) { button.hidden = true; });
		return;
	}
	var desktopMode = window.matchMedia('(min-width: 1041px)');
	var desktopToolbar = document.querySelector('.sd2-v2-toolbar');
	var lastFilterTrigger = null;
	var sheetAnchor = document.createComment('sd2-filter-sheet-anchor');
	var scrimAnchor = document.createComment('sd2-filter-scrim-anchor');
	sheet.parentNode.insertBefore(sheetAnchor, sheet);
	if (scrim) { scrim.parentNode.insertBefore(scrimAnchor, scrim); }

	/* Miva's horizontal refinery is shipped as inert template content. Materialize
	   it once so the same live facet form works in the desktop rail and sheet. */
	var facetHost = sheet.querySelector('[data-hook="add-refinery"]');
	var facetTemplate = sheet.querySelector('template[data-hook="horizontal-refinery"]');
	if (facetHost && facetTemplate && !facetHost.firstElementChild) {
		facetHost.appendChild(facetTemplate.content.cloneNode(true));
	}
	var hasFilterControls = !!sheet.querySelector('.x-refinery-set, .x-category-tree, .c-form-checkbox, .c-form-select__dropdown, input[type="checkbox"], select');
	if (!hasFilterControls) {
		sheet.hidden = true;
		sheet.setAttribute('aria-hidden', 'true');
		if (scrim) { scrim.hidden = true; }
		openers.forEach(function (button) { button.hidden = true; });
		return;
	}

	var facetTriggers = Array.prototype.slice.call(sheet.querySelectorAll('.x-refinery-set__trigger'));
	function setToolbarFacetState(trigger, open) {
		var facet = trigger.closest('.x-refinery-set');
		var list = facet && facet.querySelector('.x-refinery-set__list');
		var label = facet && facet.querySelector('.x-refinery-set__label');
		if (!list) { return; }
		if (open) {
			list.style.setProperty('opacity', '1', 'important');
			list.style.setProperty('visibility', 'visible', 'important');
			list.style.setProperty('pointer-events', 'auto', 'important');
			list.style.setProperty('transform', 'none', 'important');
		} else {
			list.style.removeProperty('opacity');
			list.style.removeProperty('visibility');
			list.style.removeProperty('pointer-events');
			list.style.removeProperty('transform');
		}
		if (label) { label.setAttribute('aria-expanded', open ? 'true' : 'false'); }
	}
	facetTriggers.forEach(function (trigger) {
		trigger.addEventListener('change', function () {
			if (!desktopMode.matches) { return; }
			facetTriggers.forEach(function (other) {
				if (other !== trigger && other.checked) { other.checked = false; }
				setToolbarFacetState(other, other === trigger && trigger.checked);
			});
		});
	});

	function mountFilterSurface(usePortal) {
		if (usePortal) {
			if (desktopToolbar) { desktopToolbar.classList.remove('sd2-v2-toolbar--with-filters'); }
			if (scrim && scrim.parentNode !== document.body) { document.body.appendChild(scrim); }
			if (sheet.parentNode !== document.body) { document.body.appendChild(sheet); }
			return;
		}
		if (desktopToolbar) {
			desktopToolbar.classList.add('sd2-v2-toolbar--with-filters');
			var toolbarGroup = desktopToolbar.querySelector('.sd2-v2-toolbar__group, .sd2-v2-toolbar__right');
			desktopToolbar.insertBefore(sheet, toolbarGroup || null);
			return;
		}
		if (scrim && scrimAnchor.parentNode) { scrimAnchor.parentNode.insertBefore(scrim, scrimAnchor.nextSibling); }
		if (sheetAnchor.parentNode) { sheetAnchor.parentNode.insertBefore(sheet, sheetAnchor.nextSibling); }
	}

	function syncFilterMode() {
		if (desktopMode.matches) {
			mountFilterSurface(false);
			facetTriggers.forEach(function (trigger) { setToolbarFacetState(trigger, trigger.checked); });
			sheet.hidden = false;
			sheet.classList.remove('is-open');
			sheet.setAttribute('aria-hidden', 'false');
			sheet.removeAttribute('role');
			sheet.removeAttribute('aria-modal');
			if (scrim) { scrim.hidden = true; scrim.classList.remove('is-open'); }
			document.body.style.overflow = '';
		} else {
			mountFilterSurface(true);
			facetTriggers.forEach(function (trigger) { setToolbarFacetState(trigger, false); });
			if (!sheet.classList.contains('is-open')) {
				sheet.hidden = true;
				sheet.setAttribute('aria-hidden', 'true');
			}
		}
	}

	function openSheet() {
		lastFilterTrigger = document.activeElement;
		sheet.hidden = false;
		sheet.setAttribute('role', 'dialog');
		sheet.setAttribute('aria-modal', 'true');
		if (scrim) { scrim.hidden = false; }
		window.requestAnimationFrame(function () {
			sheet.classList.add('is-open');
			if (scrim) { scrim.classList.add('is-open'); }
		});
		sheet.setAttribute('aria-hidden', 'false');
		openers.forEach(function (button) { button.setAttribute('aria-expanded', 'true'); });
		document.body.classList.add('sd2-filter-sheet-open');
		document.body.style.overflow = 'hidden';
		var closeButton = sheet.querySelector('[data-v2-filter-close]');
		if (closeButton) { closeButton.focus(); }
	}
	function closeSheet() {
		sheet.classList.remove('is-open');
		if (scrim) { scrim.classList.remove('is-open'); }
		sheet.setAttribute('aria-hidden', 'true');
		openers.forEach(function (button) { button.setAttribute('aria-expanded', 'false'); });
		document.body.classList.remove('sd2-filter-sheet-open');
		document.body.style.overflow = '';
		if (lastFilterTrigger && typeof lastFilterTrigger.focus === 'function') { lastFilterTrigger.focus(); }
		window.setTimeout(function () {
			if (sheet.getAttribute('aria-hidden') === 'true') { sheet.hidden = true; }
			if (scrim && !scrim.classList.contains('is-open')) { scrim.hidden = true; }
		}, 260);
	}

	openers.forEach(function (button) { button.addEventListener('click', openSheet); });
	closers.forEach(function (button) { button.addEventListener('click', closeSheet); });
	document.addEventListener('keydown', function (event) {
		if (event.key === 'Escape' && sheet.classList.contains('is-open')) { closeSheet(); }
	});
	if (desktopMode.addEventListener) { desktopMode.addEventListener('change', syncFilterMode); }
	else if (desktopMode.addListener) { desktopMode.addListener(syncFilterMode); }
	syncFilterMode();
})();

/* Product Detail V2. Page-scoped progressive enhancements for inactive PDP:
   tabs, gallery counters, keyboard thumbnail navigation, and Garage fitment copy. */
(function () {
	'use strict';
	function readGarageVehicle() {
		try {
			var list = JSON.parse(window.localStorage.getItem('sd2v2_garage') || '[]');
			return list && list[0] ? list[0] : null;
		} catch (e) {
			return null;
		}
	}
	function formatVehicle(vehicle) {
		if (!vehicle) { return ''; }
		return [vehicle.year, vehicle.make, vehicle.model, vehicle.engine].filter(Boolean).join(' ');
	}
	function normalized(value) {
		return String(value || '').toLowerCase().replace(/chevrolet/g, 'gm').replace(/chevy/g, 'gm').replace(/dodge\s*\/\s*ram/g, 'ram').replace(/dodge/g, 'ram').replace(/[^a-z0-9.]+/g, ' ').trim();
	}
	function yearMatches(text, year) {
		var wanted = parseInt(year, 10);
		if (!wanted) { return true; }
		var years = String(text).match(/(?:19|20)\d{2}/g) || [];
		if (!years.length) { return true; }
		if (years.map(Number).indexOf(wanted) !== -1) { return true; }
		if (years.length > 1) {
			var low = Math.min.apply(Math, years.map(Number));
			var high = Math.max.apply(Math, years.map(Number));
			return wanted >= low && wanted <= high;
		}
		return false;
	}
	function applicationMatches(text, vehicle) {
		var app = normalized(text);
		var make = normalized(vehicle.make);
		var model = normalized(vehicle.model);
		var engine = normalized(vehicle.engine);
		var displacement = (engine.match(/\d+(?:\.\d+)?/) || [''])[0];
		var makeMatches = !make || app.indexOf(make) !== -1 || (make === 'ford' && app.indexOf('powerstroke') !== -1) || (make === 'gm' && app.indexOf('duramax') !== -1) || (make.indexOf('ram') !== -1 && app.indexOf('cummins') !== -1);
		var modelMatches = !model || app.indexOf(model) !== -1;
		var engineMatches = !engine || app.indexOf(engine) !== -1 || (displacement && app.indexOf(displacement) !== -1);
		return yearMatches(text, vehicle.year) && makeMatches && modelMatches && engineMatches;
	}
	function refreshFitmentCopy() {
		var vehicle = readGarageVehicle();
		var label = formatVehicle(vehicle);
		var source = document.querySelector('[data-v2-product-fitments]');
		var applications = source ? Array.prototype.map.call(source.querySelectorAll('span'), function (node) { return node.textContent.trim(); }).filter(Boolean) : [];
		var status = !vehicle ? 'empty' : (!applications.length ? 'unknown' : (applications.some(function (application) { return applicationMatches(application, vehicle); }) ? 'fits' : 'does-not-fit'));
		document.querySelectorAll('.sd2-v2-fitment-confirm').forEach(function (panel) {
			panel.classList.remove('is-fit', 'is-no-fit', 'is-unknown');
			if (status === 'fits') { panel.classList.add('is-fit'); }
			if (status === 'does-not-fit') { panel.classList.add('is-no-fit'); }
			if (status === 'unknown') { panel.classList.add('is-unknown'); }
		});
		document.querySelectorAll('[data-v2-fitment-copy]').forEach(function (node) {
			if (status === 'fits') { node.textContent = 'Fits your ' + label + '.'; }
			else if (status === 'does-not-fit') { node.textContent = 'Does not fit your ' + label + '. Choose another vehicle or contact fitment support.'; }
			else if (status === 'unknown') { node.textContent = 'Fitment is not confirmed for your ' + label + '. Contact fitment support before ordering.'; }
			else { node.textContent = 'No vehicle selected. Open Garage to verify fitment before ordering.'; }
			node.setAttribute('role', 'status');
			node.setAttribute('aria-live', 'polite');
		});
	}
	document.querySelectorAll('[data-v2-pdp-tabs]').forEach(function (root) {
		if (root.dataset.v2PdpReady) { return; }
		root.dataset.v2PdpReady = '1';
		var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-v2-pdp-tab]'));
		var panels = Array.prototype.slice.call(root.querySelectorAll('[data-v2-pdp-panel]'));
		function activate(tab) {
			tabs.forEach(function (item) { item.setAttribute('aria-selected', item === tab ? 'true' : 'false'); });
			panels.forEach(function (panel) { panel.hidden = panel.id !== tab.getAttribute('aria-controls'); });
			tab.focus();
		}
		tabs.forEach(function (tab, index) {
			tab.addEventListener('click', function () { activate(tab); });
			tab.addEventListener('keydown', function (event) {
				var nextIndex = index;
				if (event.key === 'ArrowRight') { nextIndex = (index + 1) % tabs.length; }
				if (event.key === 'ArrowLeft') { nextIndex = (index - 1 + tabs.length) % tabs.length; }
				if (event.key === 'Home') { nextIndex = 0; }
				if (event.key === 'End') { nextIndex = tabs.length - 1; }
				if (nextIndex !== index) {
					event.preventDefault();
					activate(tabs[nextIndex]);
				}
			});
		});
	});
	refreshFitmentCopy();
	window.addEventListener('storage', function (event) {
		if (event.key === 'sd2v2_garage') { refreshFitmentCopy(); }
	});
	window.addEventListener('sd2v2:garage-change', refreshFitmentCopy);
})();

/* Homepage Performance Strip count-up. Progressive enhancement only; initial
   text remains usable without JS, and reduced-motion users keep static text. */
(function () {
	'use strict';
	var counters = Array.prototype.slice.call(document.querySelectorAll('[data-v2-count-to]'));
	if (!counters.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }
	var run = function (el) {
		if (el.dataset.v2CountReady) { return; }
		el.dataset.v2CountReady = '1';
		var target = parseInt(el.getAttribute('data-v2-count-to'), 10);
		if (!target) { return; }
		var start = Math.max(0, target - 16);
		var duration = 700;
		var startTime = 0;
		function frame(time) {
			if (!startTime) { startTime = time; }
			var progress = Math.min((time - startTime) / duration, 1);
			el.textContent = String(Math.round(start + ((target - start) * progress)));
			if (progress < 1) { window.requestAnimationFrame(frame); }
		}
		window.requestAnimationFrame(frame);
	};
	if ('IntersectionObserver' in window) {
		var observer = new IntersectionObserver(function (entries) {
			entries.forEach(function (entry) {
				if (entry.isIntersecting) {
					run(entry.target);
					observer.unobserve(entry.target);
				}
			});
		}, { threshold: 0.35 });
		counters.forEach(function (el) { observer.observe(el); });
		return;
	}
counters.forEach(run);
})();

/* Search Experience V2. Syncs query fields, stores recent searches locally,
   and reflects the active Garage vehicle in page copy. Progressive only. */
(function () {
	'use strict';
	var root = document.querySelector('[data-v2-search-page]');
	if (!root || root.dataset.v2Ready) { return; }
	root.dataset.v2Ready = '1';

	var input = root.querySelector('[data-v2-search-page-input]');
	var recentWrap = root.querySelector('[data-v2-search-page-recent]');
	var recentList = root.querySelector('[data-v2-search-page-recent-list]');
	var vehicleBox = root.querySelector('[data-v2-search-page-vehicle]');
	var storageKey = 'sd2v2_recent_searches';

	function renderGarageSearchSchema() {
		var params;
		try { params = new URLSearchParams(window.location.search); }
		catch (e) { return; }
		if (params.get('source') !== 'garage') { return; }
		var vehicle = [params.get('garage_year'), params.get('garage_make'), params.get('garage_engine')].filter(Boolean).join(' ');
		if (!vehicle) { return; }
		root.classList.add('sd2-v19-truck-search');
		var head = root.querySelector('[data-v2-search-results-header]');
		if (!head || head.querySelector('[data-v2-truck-search-schema]')) { return; }
		var schema = document.createElement('section');
		schema.className = 'sd2-v19-truck-search-schema';
		schema.setAttribute('data-v2-truck-search-schema', '');
		schema.setAttribute('aria-label', 'Active truck search');
		var intro = document.createElement('div');
		intro.className = 'sd2-v19-truck-search-schema__intro';
		var eyebrow = document.createElement('span'); eyebrow.textContent = 'Garage match / live Miva catalog';
		var title = document.createElement('strong'); title.textContent = vehicle;
		var copy = document.createElement('p'); copy.textContent = 'Showing the broad native catalog for this engine generation, with your selected model year carried as fitment context. Confirm final fitment on the product page before ordering.';
		intro.appendChild(eyebrow); intro.appendChild(title); intro.appendChild(copy);
		var flow = document.createElement('ol');
		[
			['01', 'Truck profile'],
			['02', 'Native product index'],
			['03', 'Fitment confirmation']
		].forEach(function (step) {
			var item = document.createElement('li');
			var number = document.createElement('span'); number.textContent = step[0];
			var label = document.createElement('b'); label.textContent = step[1];
			item.appendChild(number); item.appendChild(label); flow.appendChild(item);
		});
		var edit = document.createElement('button');
		edit.type = 'button'; edit.className = 'sd2-v19-truck-search-schema__edit'; edit.setAttribute('data-v2-garage-toggle', ''); edit.textContent = 'Change Truck';
		schema.appendChild(intro); schema.appendChild(flow); schema.appendChild(edit);
		var dataRail = head.querySelector('.sd2-v3-hero-data');
		if (dataRail) { dataRail.insertAdjacentElement('afterend', schema); }
		else { head.appendChild(schema); }
		var coverage = head.querySelector('.sd2-v3-hero-data > div:last-child strong');
		if (coverage) { coverage.textContent = params.get('garage_engine') || vehicle; }
	}

	function parseSearchFromUrl() {
		try { return new URLSearchParams(window.location.search).get('Search') || ''; }
		catch (e) { return ''; }
	}
	function loadRecent() {
		try { return JSON.parse(window.localStorage.getItem(storageKey) || '[]'); }
		catch (e) { return []; }
	}
	function saveRecent(list) {
		try { window.localStorage.setItem(storageKey, JSON.stringify(list.slice(0, 8))); }
		catch (e) { /* storage unavailable */ }
	}
	function renderRecent() {
		if (!recentWrap || !recentList) { return; }
		var recent = loadRecent();
		recentList.innerHTML = '';
		recentWrap.hidden = recent.length === 0;
		recent.forEach(function (term) {
			var link = document.createElement('a');
			link.href = window.location.pathname + '?Search=' + encodeURIComponent(term);
			link.textContent = term;
			link.addEventListener('click', function (e) {
				if (!input) { return; }
				e.preventDefault();
				input.value = term;
				input.form && input.form.submit();
			});
			recentList.appendChild(link);
		});
	}
	function remember(term) {
		term = (term || '').trim();
		if (!term) { return; }
		var recent = loadRecent().filter(function (item) { return item.toLowerCase() !== term.toLowerCase(); });
		recent.unshift(term);
		saveRecent(recent);
		renderRecent();
	}
	function refreshVehicle() {
		if (!vehicleBox) { return; }
		try {
			var list = JSON.parse(window.localStorage.getItem('sd2v2_garage') || '[]');
			if (list[0]) {
				vehicleBox.classList.remove('is-empty');
				vehicleBox.textContent = 'Search context: prioritizing copy for your ' + list[0].year + ' ' + list[0].make + ' ' + list[0].engine + '.';
			} else {
				vehicleBox.classList.add('is-empty');
				vehicleBox.textContent = 'Add your truck to make search context vehicle-aware.';
			}
		} catch (e) { /* keep empty message */ }
	}
	if (input && !input.value) { input.value = parseSearchFromUrl(); }
	if (input && input.form) {
		input.form.addEventListener('submit', function () { remember(input.value); });
	}
	if (input && input.value) { remember(input.value); }
	renderRecent();
	refreshVehicle();
	renderGarageSearchSchema();
	window.addEventListener('storage', function (e) {
		if (e.key === 'sd2v2_garage') { refreshVehicle(); }
		if (e.key === storageKey) { renderRecent(); }
	});
})();

/* PDP dossier jump navigation. Product-scoped hrefs remain the reliable
   no-JavaScript fallback; this layer keeps same-page movement polished and
   synchronizes the active section as the customer reads. */
(function () {
	'use strict';
	function initDossierJumpnav() {
		if (!document.documentElement.dataset.v2PdpJumpnavClickReady) {
			document.documentElement.dataset.v2PdpJumpnavClickReady = '1';
			document.addEventListener('click', function (event) {
				var link = event.target.closest && event.target.closest('[data-v2-pdp-jumpnav] a[href*="#"]');
				if (!link) { return; }
				var root = link.closest('[data-v2-pdp-jumpnav]');
				var pair = { link: link, section: link.hash ? document.querySelector(link.hash) : null };
				if (!root || !pair.section) { return; }
				event.preventDefault();
				event.stopImmediatePropagation();
				root.querySelectorAll('a[href*="#"]').forEach(function (candidate) {
					if (candidate === pair.link) { candidate.setAttribute('aria-current', 'location'); }
					else { candidate.removeAttribute('aria-current'); }
				});
				history.pushState(null, '', window.location.pathname + window.location.search + pair.link.hash);
				var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
				pair.section.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
			}, true);
		}

		document.querySelectorAll('[data-v2-pdp-jumpnav]').forEach(function (root) {
			if (root.dataset.v2Ready) { return; }
			root.dataset.v2Ready = '1';
			var links = Array.prototype.slice.call(root.querySelectorAll('a[href*="#"]'));
			var currentProductUrl = window.location.href.split('#')[0];
			links.forEach(function (link) { link.href = currentProductUrl + link.hash; });
			var pairs = links.map(function (link) {
				return { link: link, section: link.hash ? document.querySelector(link.hash) : null };
			}).filter(function (pair) { return pair.section; });
			if (!pairs.length) { return; }

			function setCurrent(link) {
				pairs.forEach(function (pair) {
					if (pair.link === link) { pair.link.setAttribute('aria-current', 'location'); }
					else { pair.link.removeAttribute('aria-current'); }
				});
			}

			var initial = pairs.find(function (pair) { return pair.link.hash === window.location.hash; });
			setCurrent(initial ? initial.link : pairs[0].link);

			if ('IntersectionObserver' in window) {
				var observer = new IntersectionObserver(function (entries) {
					var visible = entries.filter(function (entry) { return entry.isIntersecting; })
						.sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; });
					if (!visible.length) { return; }
					var match = pairs.find(function (pair) { return pair.section === visible[0].target; });
					if (match) { setCurrent(match.link); }
				}, { rootMargin: '-20% 0px -62% 0px', threshold: [0, 0.2, 0.5] });
				pairs.forEach(function (pair) { observer.observe(pair.section); });
			}
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initDossierJumpnav, { once: true });
	} else {
		initDossierJumpnav();
	}
})();

/* Commerce Foundation V2. Shared progressive behavior for inactive commerce
   partials: quantity, accordion, media gallery/zoom, and sticky buy bar. */
(function () {
	'use strict';
	document.querySelectorAll('[data-v2-qty]').forEach(function (root) {
		if (root.dataset.v2Ready) { return; }
		root.dataset.v2Ready = '1';
		var input = root.querySelector('[data-v2-qty-input]');
		var minus = root.querySelector('[data-v2-qty-minus]');
		var plus = root.querySelector('[data-v2-qty-plus]');
		if (!input) { return; }
		function step(delta) {
			var min = parseInt(input.getAttribute('min') || '1', 10);
			var value = parseInt(input.value || String(min), 10);
			input.value = String(Math.max(min, value + delta));
			input.dispatchEvent(new Event('change', { bubbles: true }));
			var form = root.closest('form');
			if (form) {
				var submitter = form.querySelector('[data-v2-qty-submit], button[type="submit"], input[type="submit"]');
				if (typeof form.requestSubmit === 'function') { form.requestSubmit(submitter); }
				else if (submitter) { submitter.click(); }
			}
		}
		if (minus) { minus.addEventListener('click', function () { step(-1); }); }
		if (plus) { plus.addEventListener('click', function () { step(1); }); }
	});

	document.querySelectorAll('[data-v2-accordion]').forEach(function (root) {
		if (root.dataset.v2Ready) { return; }
		root.dataset.v2Ready = '1';
		root.querySelectorAll('[data-v2-accordion-trigger]').forEach(function (trigger) {
			trigger.addEventListener('click', function () {
				var panel = trigger.parentElement && trigger.parentElement.querySelector('[data-v2-accordion-panel]');
				var open = trigger.getAttribute('aria-expanded') === 'true';
				trigger.setAttribute('aria-expanded', open ? 'false' : 'true');
				if (panel) { panel.hidden = open; }
			});
		});
	});

	document.querySelectorAll('[data-v2-gallery]').forEach(function (root) {
		if (root.dataset.v2Ready) { return; }
		root.dataset.v2Ready = '1';
		var main = root.querySelector('[data-v2-gallery-main]');
		var viewer = root.querySelector('[data-v2-zoom-viewer]');
		var thumbs = Array.prototype.slice.call(root.querySelectorAll('[data-v2-gallery-thumb]'));
		var current = root.querySelector('[data-v2-gallery-count-current]');
		var total = root.querySelector('[data-v2-gallery-count-total]');
		if (total) { total.textContent = String(thumbs.length); }
		function activateThumb(thumb) {
			var src = thumb.getAttribute('data-v2-gallery-src');
			var index = thumbs.indexOf(thumb);
			if (main && src) { main.setAttribute('src', src); }
			thumbs.forEach(function (item) { item.classList.remove('is-active'); });
			thumb.classList.add('is-active');
			if (viewer) { viewer.classList.remove('is-zoomed'); }
			if (current) { current.textContent = String(index >= 0 ? index + 1 : 1); }
		}
		thumbs.forEach(function (thumb, index) {
			thumb.addEventListener('click', function () {
				activateThumb(thumb);
			});
			thumb.addEventListener('keydown', function (event) {
				var nextIndex = index;
				if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { nextIndex = (index + 1) % thumbs.length; }
				if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { nextIndex = (index - 1 + thumbs.length) % thumbs.length; }
				if (nextIndex !== index) {
					event.preventDefault();
					thumbs[nextIndex].focus();
					activateThumb(thumbs[nextIndex]);
				}
			});
		});
		root.querySelectorAll('[data-v2-zoom-toggle]').forEach(function (button) {
			button.addEventListener('click', function () {
				if (viewer) { viewer.classList.toggle('is-zoomed'); }
			});
		});
	});

	document.querySelectorAll('[data-v2-sticky-buy]').forEach(function (bar) {
		if (bar.dataset.v2Ready) { return; }
		bar.dataset.v2Ready = '1';
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) { return; }
		var target = document.querySelector('#description') || document.querySelector('[data-v2-buy-button]');
		if (!target) { return; }
		// Show the sticky bar only once the whole Overview (#description)
		// section has scrolled above the top of the viewport. #description is
		// a tall section, so watching plain intersection would keep it
		// "intersecting" until its bottom left the screen far too late. Toggle
		// on the section's bottom edge instead: visible when bottom < 0.
		var observer = new IntersectionObserver(function (entries) {
			entries.forEach(function (entry) {
				bar.classList.toggle('is-visible', entry.boundingClientRect.bottom < 0);
			});
		}, { threshold: 0, rootMargin: '0px 0px 999999px 0px' });
		observer.observe(target);
	});
})();

/* Same-page homepage jumps must not be resolved against Miva's /mm5/ base URL. */
(function () {
	'use strict';
	document.querySelectorAll('[data-sd2-scroll-to]').forEach(function (link) {
		link.addEventListener('click', function (event) {
			var target = document.getElementById(link.dataset.sd2ScrollTo);
			if (!target) { return; }
			event.preventDefault();
			var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
			history.replaceState(null, '', window.location.pathname + window.location.search + '#' + target.id);
		});
	});
})();

/* Help sub-page form embeds (monday.com iframes + the LiveHelpNow ticket widget on
   Order Tracking). Both are effectively cross-origin: we cannot read their real
   rendered content height, so there is no way to size the container exactly from
   here. Two-tier strategy:
     1. Best-effort auto-resize via postMessage, for any embed that broadcasts its
        height that way (some monday.com form embeds do; LiveHelpNow's widget does
        not, since it isn't in an iframe).
     2. HELP_EMBED_HEIGHTS below — one fallback height per page, used whenever no
        resize message ever arrives. This is the single place to adjust a page's
        height; add a new "<page-code>: <px>" entry here for any future Help Center
        form instead of hardcoding a height in the template. */
(function () {
	'use strict';

	var HELP_EMBED_HEIGHTS = {
		'help-sales-inquiry': 820, // was 950px with a large empty gap below the card per full-page screenshot; trimmed
		'help-check-order-status': 1100, // was 1137px with Submit visible but a bit of trailing gap; trimmed slightly
		'help-sinister-diesel-parts-tech-support': 2050, // was 1750px, form was cut off mid-file-upload with a scrollbar; increased
		'help-warranty-inquiry': 1700, // not visually re-checked in the latest screenshot batch — still unconfirmed
		'help-online-account-issues': 1650, // was 1700px, Submit visible right at the edge with minimal gap; roughly correct, trimmed slightly
		'shipping-protection-requests': 1750, // was 1200px, form was cut off mid-file-upload with a scrollbar; increased
		'returns_exchanges': 1750, // was 1900px, Submit/Save-as-draft visible with a bit of trailing gap; trimmed
		'dlrq': 1400 // Become a Dealer / dealer-application.html — unconfirmed estimate, needs a live check
	};

	document.querySelectorAll('[data-v2-help-embed-wrap]').forEach(function (wrap) {
		if (wrap.dataset.v2Ready) { return; }
		wrap.dataset.v2Ready = '1';

		var pageCode = wrap.dataset.v2HelpEmbedWrap;
		var fallback = HELP_EMBED_HEIGHTS[pageCode];
		if (fallback) {
			wrap.style.setProperty('--sd2-help-embed-h', fallback + 'px');
		}

		var frame = wrap.querySelector('iframe');
		if (!frame) { return; }

		window.addEventListener('message', function (event) {
			if (event.source !== frame.contentWindow || typeof event.data !== 'object' || !event.data) { return; }
			var height = event.data.height || (event.data.data && event.data.data.height);
			if (height && height > 0) {
				wrap.style.setProperty('--sd2-help-embed-h', Math.ceil(height) + 'px');
			}
		});
	});
})();
