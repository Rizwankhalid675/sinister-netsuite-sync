/**
 * When called from a `theme.js` file on a product page, this extension will
 * work with the default page code to add a product to the cart utilizing an
 * AJAX call to the form processor.
 *
 * The function contains internal error checking as well as a check to see which
 * page was reached and displaying messages accordingly. If the store is also
 * utilizing the `mini-basket` extension, said extension will be triggered for
 * display upon successfully adding a product to the cart.
 */
(function (window, document, undefined) {
	'use strict';

	if(!document.contains(document.querySelector('[data-hook="add-to-cart"]'))){
		return;
	}

	var purchaseHook = document.querySelector('[data-hook="add-to-cart"]');
	var purchaseForm = document.querySelector('[data-hook="purchase"]');
	if (!purchaseForm) {
		return;
	}

	/* Revamp PDP uses the native Miva purchase form and basket handoff directly.
	   Skip the legacy AJAX shim there so native ADPR handling, attribute-machine
	   validation, and basket rendering stay in sync. */
	if (purchaseForm.hasAttribute('data-v2-buy-form')) {
		return;
	}

	var purchaseButton = purchaseHook.matches('input, button') ? purchaseHook : purchaseHook.querySelector('input, button');
	if (!purchaseButton) {
		return;
	}

	var purchaseButtonText = (purchaseButton.nodeName.toLowerCase() === 'input') ? purchaseButton.value : purchaseButton.textContent;
	var purchaseFormActionInput = purchaseForm.querySelector('input[name="Action"]');
	var responseMessage = document.querySelector('[data-hook="purchase-message"]');
	var miniBasketCount = document.querySelectorAll('[data-hook~="mini-basket-count"]');
	var miniBasketAmount = document.querySelectorAll('[data-hook~="mini-basket-amount"]');
	var v2CartRoot = document.querySelector('[data-v2-cart]');

	function escapeHtml(value) {
		return String(value || '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function syncV2CartDrawer(basketData) {
		if (!v2CartRoot || !basketData) {
			return false;
		}

		var body = v2CartRoot.querySelector('.sd2-v2-cart-panel__body');
		var subtotal = v2CartRoot.querySelector('[data-v2-cart-subtotal]');
		var shippingMessage = v2CartRoot.querySelector('[data-v2-cart-shipping-msg]');
		var count = parseInt(basketData.getAttribute('data-item-count') || '0', 10);
		var subtotalText = basketData.getAttribute('data-subtotal') || '$0.00';

		if (subtotal) {
			subtotal.textContent = subtotalText;
		}

		if (shippingMessage) {
			shippingMessage.innerHTML = count > 0 ? ('Cart subtotal: <strong>' + escapeHtml(subtotalText) + '</strong>') : 'Shipping is calculated during checkout.';
		}

		if (!body) {
			return true;
		}

		if (!count) {
			body.innerHTML = [
				'<div class="sd2-v2-cart-empty" data-v2-cart-empty>',
					'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16l-1.5 11a2 2 0 0 1-2 1.7H7.5a2 2 0 0 1-2-1.7L4 6Z"></path><path d="M9 6V5a3 3 0 0 1 6 0v1"></path></svg>',
					'<p>Your cart is empty.</p>',
					'<a class="sd2-btn sd2-btn--outline" href="/">Continue Shopping</a>',
				'</div>'
			].join('');
			return true;
		}

		var lines = Array.prototype.slice.call(basketData.querySelectorAll('.x-mini-basket__line')).map(function (line) {
			var image = line.querySelector('.x-mini-basket__image img');
			var name = line.querySelector('.x-mini-basket__item-name');
			var price = line.querySelector('.x-mini-basket__item-price');
			var qty = line.querySelector('.x-mini-basket__item-quantity .u-text-medium');
			var quantity = Math.max(1, parseInt(qty ? qty.textContent.trim() : '1', 10) || 1);
			var basketGroup = line.getAttribute('data-basket-group') || '';
			var remove = line.querySelector('.x-mini-basket__item-total a[href*="Action=RPRD"]');
			var options = Array.prototype.slice.call(line.querySelectorAll('.x-mini-basket__item-attributes')).map(function (option) {
				return '<p class="sd2-v2-cart-item__meta">' + escapeHtml(option.textContent.trim()) + '</p>';
			}).join('');

			return [
				'<article class="sd2-v2-cart-item">',
					'<a class="sd2-v2-cart-item__media" href="', escapeHtml(name ? name.getAttribute('href') : '#'), '">',
						'<img src="', escapeHtml(image ? image.getAttribute('src') : ''), '" alt="', escapeHtml(image ? image.getAttribute('alt') : ''), '" loading="lazy">',
					'</a>',
					'<div class="sd2-v2-cart-item__body">',
						'<h3><a href="', escapeHtml(name ? name.getAttribute('href') : '#'), '">', escapeHtml(name ? name.textContent.trim() : ''), '</a></h3>',
						basketGroup ? '<form class="sd2-v2-cart-qty" data-v2-cart-qty data-basket-group="' + escapeHtml(basketGroup) + '"><button type="button" data-v2-cart-qty-minus aria-label="Decrease quantity">−</button><input type="number" min="0" inputmode="numeric" value="' + quantity + '" aria-label="Quantity" data-v2-cart-qty-input><button type="button" data-v2-cart-qty-plus aria-label="Increase quantity">+</button></form>' : '<p class="sd2-v2-cart-item__meta">Qty ' + quantity + '</p>',
						options,
						remove ? '<a class="sd2-v2-link-button" href="' + escapeHtml(remove.getAttribute('href')) + '">Remove</a>' : '',
					'</div>',
					'<strong class="sd2-v2-cart-item__price">', escapeHtml(price ? price.textContent.trim() : ''), '</strong>',
				'</article>'
			].join('');
		}).join('');

		body.innerHTML = '<div class="sd2-v2-cart-lines" data-v2-cart-items>' + lines + '</div>';
		return true;
	}

//MJB 2022/09/21 target to purchaseButton (from purchaseForm) and changed event to 'click" to avoid conflict with mvga.js (GoogleAnalytics) which also binds to submit 

	purchaseButton.addEventListener('click', function (evt) {
		if (purchaseFormActionInput.value !== 'ADPR') {
			return;
		}

		evt.preventDefault();
		evt.stopImmediatePropagation();

		purchaseForm.action = purchaseHook.getAttribute('data-action') || purchaseButton.getAttribute('data-action') || purchaseForm.action;
		purchaseFormActionInput.value = 'ADPR';

		var data = new FormData(purchaseForm);
		var request = new XMLHttpRequest(); // Set up our HTTP request

//MJB 2022/1/4  Modifications made to accomodate Listrak ADPR functionality
var dataA = $('[data-hook="purchase"').serializeArray().reduce(function(obj, item) {
    obj[item.name] = item.value;
    return obj;
}, {});

		purchaseForm.setAttribute('data-status', 'idle');

		if (purchaseForm.getAttribute('data-status') !== 'submitting') {
			purchaseForm.setAttribute('data-status', 'submitting');
			purchaseButton.classList.add('is-disabled');

			if (purchaseButton.nodeName.toLowerCase() === 'input') {
				purchaseButton.value = 'Processing...';
			}
			else{
				purchaseButton.textContent = 'Processing...';
			}

			responseMessage.innerHTML = '';

			// Setup our listener to process completed requests
			request.onreadystatechange = function () {
				// Only run if the request is complete
				if (request.readyState !== 4) {
					return;
				}

				// Process our return data
				if (request.status === 200) {
					// What do when the request is successful
					var response = request.response;

					if (response.body.id === 'js-BASK') {
						var basketData = response.querySelector('[data-hook="mini-basket"]');
						var basketCount = basketData.getAttribute('data-item-count');
						var basketSubtotal_raw = basketData.getAttribute('data-subtotal');
                        var basketSubtotal = basketSubtotal_raw.replace('$','');

//MJB 2022/1/4  Modifications made to accomodate Listrak ADPR functionality
var basketProductEach = +basketSubtotal / +basketCount;
var productSubtotal = +dataA['Quantity'] * +basketProductEach;
var scriptListrak = document.createElement('script');
scriptListrak.innerHTML="(function(){if(typeof _ltk == 'object'){ltkCode();}else{(function (d) { if (document.addEventListener) document.addEventListener('ltkAsyncListener', d); else { e = document.documentElement; e.ltkAsyncProperty = 0; e.attachEvent('onpropertychange', function (e) { if (e.propertyName == 'ltkAsyncProperty') { d(); } }); } })(function(){ltkCode();});}function ltkCode(){_ltk_util.ready(function(){";
scriptListrak.innerHTML += "_ltk.SCA.Persistent.addItem('"+ product_sku + "'," + dataA['Quantity'] + ", '" + productSubtotal + "', '" + product_name + "', '" + product_image + "', '" + product_url + "');";
scriptListrak.innerHTML += "_ltk.SCA.Submit();";
scriptListrak.innerHTML += "})}})();";
document.getElementsByTagName('head')[0].appendChild(scriptListrak);

/*
	(function(){if(typeof _ltk == 'object'){ltkCode();}else{(function (d) { if (document.addEventListener) document.addEventListener('ltkAsyncListener', d); else { e = document.documentElement; e.ltkAsyncProperty = 0; e.attachEvent('onpropertychange', function (e) { if (e.propertyName == 'ltkAsyncProperty') { d(); } }); } })(function(){ltkCode();});}function ltkCode(){_ltk_util.ready(function(){
	_ltk.SCA.Persistent.addItem('sku', quantity, 'price', 'title', 'imageURL', 'linkURL');
_ltk.SCA.Submit();    
    })}})();
*/


						/* Facebook Pixel GDJM 07/30/24  */
						var fb_prod = {
							name : purchaseForm.querySelector('[name="Product_Name"]').value,
							code : purchaseForm.querySelector('[name="Product_Code"]').value,
							price : purchaseForm.querySelector('[name="Product_Price"]').value
						}
						fb_add_to_cart(fb_prod);


						if (miniBasketCount) {
							for (var mbcID = 0; mbcID < miniBasketCount.length; mbcID++) {
								miniBasketCount[mbcID].textContent = basketCount; // Update mini-basket quantity (display only)
							}
						}

						if (miniBasketAmount) {
							for (var mbaID = 0; mbaID < miniBasketAmount.length; mbaID++) {
								miniBasketAmount[mbaID].textContent = basketSubtotal; // Update mini-basket subtotal (display only)
							}
						}

						if (syncV2CartDrawer(basketData)) {
							setTimeout(function () {
								var trigger = document.querySelector('[data-v2-cart-open], [data-hook="open-mini-basket"]');
								if (trigger) {
									trigger.click();
								}
							}, 100);
						}
						else if (typeof miniBasket !== 'undefined' && document.querySelector('[data-hook="mini-basket"]')) {
							document.querySelector('[data-hook="mini-basket"]').innerHTML = response.querySelector('[data-hook="mini-basket"]').innerHTML;

							setTimeout(function () {
								document.querySelector('[data-hook="open-mini-basket"]').click();
							}, 100);
						}
						else {
							responseMessage.innerHTML = '<div class="x-messages x-messages--success"><span class="u-icon-check"></span> Added to cart.</div>';
						}

						// Re-Initialize Attribute Machine (if it is active)
						if (typeof attrMachCall !== 'undefined') {
							attrMachCall.Initialize();
						}
					}
					else if(response.body.id === 'js-PATR') {
						var findRequired = purchaseForm.querySelectorAll('.is-required');
						var missingAttributes = [];

						for (var id = 0; id < findRequired.length; id++) {
							missingAttributes.push(' ' + findRequired[id].title);
						}

						responseMessage.innerHTML = '<div class="x-messages x-messages--warning">All <em class="u-color-red">Required</em> options have not been selected.<br />Please review the following options: <span class="u-color-red">' + missingAttributes + '</span>.</div>';
					}
					else if(response.body.id === 'js-PLMT') {
						responseMessage.innerHTML = '<div class="x-messages x-messages--warning">We do not have enough of the combination you have selected.<br />Please adjust your quantity.</div>';
					}
					else if(response.body.id === 'js-POUT') {
						responseMessage.innerHTML = '<div class="x-messages x-messages--warning">The combination you have selected is out of stock.<br />Please review your options or check back later.</div>';
					}
					else {
						responseMessage.innerHTML = '<div class="x-messages x-messages--warning">Please review your selection.</div>';
					}

					// Reset button text and form status
					purchaseButton.classList.remove('is-disabled');

					purchaseButton.style.backgroundColor = '#307962';
					purchaseButton.style.color = '#fff';
					if (purchaseButton.nodeName.toLowerCase() === 'input') {
						purchaseButton.value = 'Product Added';
					}
					else{
						purchaseButton.textContent = 'Product Added';
					}

					setTimeout(function () {
						if (purchaseButton.nodeName.toLowerCase() === 'input') {
							purchaseButton.value = purchaseButtonText;
						}
						else{
							purchaseButton.textContent = purchaseButtonText;
						}
						purchaseButton.removeAttribute('style');
					}, 3000);

					purchaseForm.setAttribute('data-status', 'idle');
				}
				else {
					// What do when the request fails
					console.log('The request failed!');
					purchaseForm.setAttribute('data-status', 'idle');
				}
			};

			/**
			 * Create and send a request
			 * The first argument is the post type (GET, POST, PUT, DELETE, etc.)
			 * The second argument is the endpoint URL
			 */
			request.open(purchaseForm.method, purchaseForm.action, true);
			request.responseType = 'document';
			request.send(data);
		}
	}, false);

})(window, document);
