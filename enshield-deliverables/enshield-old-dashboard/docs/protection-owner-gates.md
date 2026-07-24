# Protection pricing and reporting owner gates

The implementation fails closed until the following decisions are approved:

- Identify the authoritative workflow and approver for creating immutable pricing versions.
- Confirm the exact Shopify line-item/product identity that proves the charged Enshield premium.
- Approve a historical backfill source for charged premium snapshots. Missing snapshots report zero.
- Define whether insurance revenue is gross charged premium or net of premium refunds.
- Approve supported shop currencies and any non-standard currency precision.
- Confirm whether cancelled or fully refunded coverage remains visible only as gross purchased history.

No current configuration is used to reconstruct historical premium revenue, and no nearest-price
or zero-price Shopify variant is substituted.
