# Sinister Diesel V2 Release Closeout

**Branch:** `Revamp_v2` preview  
**Verification date:** July 22, 2026  
**Purpose:** Record the final engineering state without overstating owner-controlled launch work.

## Completed in this closeout

- Standardized catalog pagination on the left across supported category and listing layouts.
- Added the global Technical Blue text-selection treatment: `#2149dd` with white text and no inherited text shadow.
- Pushed the final shared CSS to the Miva preview branch.
- Re-ran the complete root regression suite: **20 passed, 0 failed**.
- Re-ran targeted desktop/mobile accessibility checks on category, help, commerce, and account routes.
- Verified the branch CSS directly from `/mm5/css/00000001/b37/sd2-global.css` after deployment.
- Confirmed the forms Node process is online in PM2 and healthy at `127.0.0.1:3100`.
- Confirmed the current temporary tunnel accepts the storefront CORS preflight and returns the expected `422` validation response for an intentionally empty request without creating a Monday item.
- Repaired the six native Help Center workflows so their form-specific fields are normalized to the deployed `sinister-forms-api` contract without losing workflow, order, product, or attachment context.
- Added a controlled `404`-only fallback from the permanent forms hostname to the current Cloudflare tunnel. Ambiguous network or server failures do not retry, preventing accidental duplicate Monday items.
- Pushed the Help Center templates and shared component JavaScript to the `Revamp_v2` preview branch and confirmed `mmt status` is clean.
- Verified the Returns / Exchanges workflow in an isolated desktop and mobile Chromium session using the authenticated preview cookie handoff. The test intercepted both POST requests, proved permanent-hostname-to-tunnel fallback and success-state rendering, and created no real Monday item.
- Re-ran the forms integration suite after the repair: **36 passed, 0 failed**.

## Integration boundary findings

| Boundary | Result | Release meaning |
|---|---|---|
| Forms Node process | Healthy; PM2 online | Application service is available on the server. |
| Temporary Cloudflare tunnel | POST route reachable with expected CORS and validation behavior | Provides a temporary `404`-only fallback for Sales Inquiry and the six native Help Center workflows. |
| `forms-api.sinisterdiesel.com` | DNS resolves, but `/healthz` and `/api/forms/submit` return Apache 404 | Permanent hostname is pointed at the wrong origin. The storefront fallback keeps the forms usable in preview, but DNS remains a launch gate. |
| Storefront form contract | 36/36 integration tests pass | Native Help Center fields now map to the API schema and preserve workflow context in the Monday item body. |
| Extend | Vendor integration not owner-verified | Requires the Extend merchant owner or Miva module administrator. |
| Configurable zero-base-price products | Frontend mitigation active | New-style and old-style 2003-2007 6.0L replacement coolant-filter hose listings use **Choose options**; catalog base pricing still needs merchandising ownership. |

## Exact DNS correction required

The Cloudflare/DNS owner should make the proxied `forms-api` hostname reach the forms server at `163.192.15.136`. After the change, verify:

```bash
curl -i https://forms-api.sinisterdiesel.com/api/forms/submit \
  -X OPTIONS \
  -H "Origin: https://sinisterdiesel.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
```

Expected: `204`, with `Access-Control-Allow-Origin: https://sinisterdiesel.com`.

Then run an intentionally invalid, non-mutating request:

```bash
curl -i https://forms-api.sinisterdiesel.com/api/forms/submit \
  -X POST \
  -H "Origin: https://sinisterdiesel.com" \
  -H "Content-Type: application/json" \
  --data '{}'
```

Expected: `422` JSON validation response, not an HTML 404 page.

## Verification commands

```powershell
node --test --test-reporter=spec tests/*.test.js

Push-Location integrations/forms-sync
npm test
Pop-Location

$mmtScripts = py -c "import sysconfig; print(sysconfig.get_path('scripts', scheme='nt_user'))"
& (Join-Path $mmtScripts 'mmt.exe') status
```

Expected current results:

- Root regression files: **20 passed, 0 failed**.
- Forms/API integration tests: **36 passed, 0 failed**.
- MMT: **No files modified**.

## Remaining launch gates

These items require authority or access outside storefront source code:

1. Correct the permanent forms DNS/proxy route, remove the temporary tunnel fallback after verification, and perform one controlled Monday + confirmation-email submission for every help workflow.
2. Resolve Extend with the merchant owner, or formally approve it as a launch exception.
3. Correct the configurable zero-base-price catalog records in Miva.
4. Complete an authorized test-gateway or controlled transaction through order creation, confirmation, and refund/cancellation handling.
5. Smoke-test current Safari, Firefox, Edge, iOS Safari, and Android Chrome on physical devices.
6. Review the dirty parent Git worktree and create a scoped, recoverable release commit/tag without including unrelated user changes.
7. Publish `Revamp_v2` only after the store owner signs off on the gates above.

## Release conclusion

The V2 storefront presentation, navigation, category/PDP controls, cart quantity behavior, checkout styling, account experience, editorial templates, SEO contracts, responsive treatment, and Technical Blue interaction layer are implemented and regression-tested. The remaining blockers are operational integration and release-authority tasks, not unresolved visual styling work.
