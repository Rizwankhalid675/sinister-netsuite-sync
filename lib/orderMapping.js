function moneyToCents(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) throw new Error(`Invalid money value: ${value}`);
  return Math.round((number + Number.EPSILON) * 100);
}

function centsToMoney(cents) {
  return Number((cents / 100).toFixed(2));
}

function formatOptionDescription(option) {
  const label = String(option.attr_prompt || option.attribute || option.attr_code || '').trim();
  const selection = String(option.opt_prompt || option.value || option.opt_code || '').trim();
  return [label, selection].filter(Boolean).join(': ');
}

function expandMivaItems(order) {
  return (order.items || []).flatMap((item) => {
    const quantity = Number(item.quantity || 1);
    const sku = String(item.sku || item.code || '').trim();
    if (!sku) throw new Error(`Miva item ${item.line_id || 'unknown'} has no SKU`);
    const zeroPriceSelections = (item.options || [])
      .filter((option) => moneyToCents(option.price) === 0)
      .map(formatOptionDescription)
      .filter(Boolean);
    const productDescription = String(item.name || sku).trim();
    const parent = {
      sourceKey: `${item.line_id}:parent`,
      kind: 'parent',
      sku,
      quantity,
      rateCents: moneyToCents(item.price),
      amountCents: moneyToCents(item.price) * quantity,
      taxable: moneyToCents(item.tax) > 0,
      description: [productDescription, zeroPriceSelections.join(', ')].filter(Boolean).join(' — '),
      mivaLineId: item.line_id,
    };
    const options = (item.options || [])
      .filter((option) => moneyToCents(option.price) !== 0)
      .map((option, index) => {
        const optionSku = String(option.value || option.opt_code || '').trim();
        if (!optionSku) throw new Error(`Price-bearing option ${index + 1} on Miva item ${item.line_id} has no SKU`);
        const optionQuantity = Number(option.quantity || quantity);
        const rateCents = moneyToCents(option.price);
        return {
          sourceKey: `${item.line_id}:option:${option.attribute || option.attr_code || index}`,
          kind: 'option',
          sku: optionSku,
          quantity: optionQuantity,
          rateCents,
          amountCents: rateCents * optionQuantity,
          taxable: moneyToCents(item.tax) > 0,
          description: formatOptionDescription(option) || optionSku,
          mivaLineId: item.line_id,
        };
      });
    return [parent, ...options];
  });
}

function validateMivaOrderTotals(order, expandedLines) {
  for (const item of order.items || []) {
    const expected = moneyToCents(item.total);
    const actual = expandedLines
      .filter((line) => String(line.mivaLineId) === String(item.line_id))
      .reduce((sum, line) => sum + line.amountCents, 0);
    if (expected !== actual) {
      throw new Error(`Miva item ${item.line_id} does not reconcile exactly`);
    }
  }
  const productCents = expandedLines.reduce((sum, line) => sum + line.amountCents, 0);
  const chargeCents = (order.charges || []).reduce((sum, charge) => sum + moneyToCents(charge.amount), 0);
  const orderCents = moneyToCents(order.total);
  if (productCents + chargeCents !== orderCents) {
    throw new Error(`Miva order ${order.id || 'unknown'} does not reconcile exactly`);
  }
  return { productCents, chargeCents, orderCents };
}

function buildItemSkuCandidates(sku) {
  const exact = String(sku || '').trim();
  const normalized = exact.toUpperCase().replace(/_/g, '.');
  return [...new Set([exact, normalized].filter(Boolean))];
}

async function resolveExpandedLines(lines, lookup, overrides = {}, lookupById) {
  const resolved = [];
  for (const line of lines) {
    if (overrides[line.sku]) {
      const overrideId = String(overrides[line.sku]);
      if (typeof lookupById !== 'function') {
        throw new Error(`NetSuite override ${overrideId} cannot be verified`);
      }
      const matches = await lookupById(overrideId);
      if (matches.length === 0) throw new Error(`NetSuite override ${overrideId} was not found`);
      if (matches.length > 1) throw new Error(`NetSuite override ${overrideId} returned multiple items`);
      const expectedSkus = buildItemSkuCandidates(line.sku).map((candidate) => candidate.toUpperCase());
      const actualSku = String(matches[0].itemid || '').trim().toUpperCase();
      if (!expectedSkus.includes(actualSku)) {
        throw new Error(`NetSuite override ${overrideId} does not match SKU ${line.sku}`);
      }
      resolved.push({ ...line, itemId: String(matches[0].id) });
      continue;
    }
    let match = null;
    for (const candidate of buildItemSkuCandidates(line.sku)) {
      const matches = await lookup(candidate);
      if (matches.length > 1) throw new Error(`Multiple NetSuite items match SKU ${candidate}`);
      if (matches.length === 1) {
        match = matches[0];
        break;
      }
    }
    if (!match) throw new Error(`NetSuite item for SKU ${line.sku} was not found`);
    resolved.push({ ...line, itemId: String(match.id) });
  }
  return resolved;
}

function buildNetsuiteLines(resolvedLines, order) {
  const lines = resolvedLines.map((line) => ({
    item: { id: line.itemId },
    description: line.description,
    quantity: line.quantity,
    price: { id: '-1' },
    rate: centsToMoney(line.rateCents),
    amount: centsToMoney(line.amountCents),
    custcol_hb_miva_order_line_id: line.mivaLineId,
    taxcode: { id: line.taxable ? '12260' : '-7' },
    location: { id: '2' },
  }));
  const protection = (order.charges || []).find((charge) => charge.type === 'enshield_charge');
  if (protection) {
    lines.push({
      item: { id: '10322' },
      description: protection.descrip || 'Enshield Package Protection',
      quantity: 1,
      price: { id: '-1' },
      rate: centsToMoney(moneyToCents(protection.amount)),
      amount: centsToMoney(moneyToCents(protection.amount)),
      taxcode: { id: moneyToCents(protection.tax) > 0 ? '12260' : '-7' },
      location: { id: '2' },
    });
  }
  return lines;
}

function assertProtectionItemTaxable(order, itemMetadata) {
  const protection = (order.charges || []).find((charge) => charge.type === 'enshield_charge');
  if (protection && moneyToCents(protection.tax) > 0 && String(itemMetadata?.taxschedule) !== '1') {
    throw new Error(`Enshield protection charged tax in Miva, but NetSuite item 10322 must use tax schedule 1`);
  }
}

function assertTotalsMatch(mivaTotal, netsuiteTotal) {
  if (moneyToCents(mivaTotal) !== moneyToCents(netsuiteTotal)) {
    throw new Error('NetSuite total does not reconcile with Miva total');
  }
  return true;
}

module.exports = {
  moneyToCents,
  expandMivaItems,
  validateMivaOrderTotals,
  buildItemSkuCandidates,
  resolveExpandedLines,
  buildNetsuiteLines,
  assertProtectionItemTaxable,
  assertTotalsMatch,
};
