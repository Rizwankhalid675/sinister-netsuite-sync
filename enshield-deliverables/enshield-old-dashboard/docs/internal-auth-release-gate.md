# Internal authentication release gate

The internal dashboard is not authorized for production until an owner supplies
and validates an external identity handoff adapter.

Required configuration:

- `INTERNAL_AUTH_HANDOFF_URL`: owner-controlled HTTPS login/handoff endpoint.
- `INTERNAL_AUTH_SHARED_SECRET`: at least 32 random bytes, stored only in secret
  configuration and independently rotated.
- `INTERNAL_AUTH_ISSUER`: exact expected issuer string.
- `INTERNAL_AUTH_AUDIENCE`: exact Enshield dashboard audience.

The adapter must return a token lasting no more than five minutes. The token is
accepted only when its HS256 signature, issuer, audience, issued-at time,
expiry, server-session state, and server-session nonce all verify. The subject
must match an active, owner-provisioned `internalOperator`. Browser-supplied
person identifiers are never accepted.

Gadget's available `Session` API provides `set`, `delete`, `end`, and `persist`,
but no rotate/regenerate operation. Ending the session cannot issue a
replacement session in the same callback. Until Gadget supplies rotation, the
flow mitigates fixation by clearing any identity before starting, replacing the
challenge with 256-bit random state and nonce, consuming that challenge before
verification, clearing identity on every failure, enforcing a ten-minute
challenge lifetime and twelve-hour authenticated-session lifetime, and checking
operator status and assignments on every request. Formal acceptance of this
residual no-rotation limitation is a release gate.

The browser adapter must return the token in the URL fragment
(`/internal-auth/callback#token=...`), never in the query string. The callback
removes the fragment before sending the token in a credentialed POST. A
database-unique, hashed `internalAuthReceipt` consumes the verified challenge
before identity is set, preventing concurrent replay without storing the token,
state, or nonce.

Operator and `operatorShopAssignment` records are owner-provisioned through a
server-side administrative process only. No public create/update/delete routes
exist for these models. Every assignment is evaluated separately; a grant for
one shop does not authorize another shop.

Before release:

1. Sync the new models and session fields to a non-production Gadget environment.
2. Configure the real owner-approved identity adapter and secrets.
3. Exercise login, replay, expiry, wrong issuer/audience/state/nonce, operator
   deactivation, assignment revocation, and cross-shop denial tests.
4. Complete browser accessibility and responsive QA.
5. Rotate the shared secret once after staging validation and document its owner.
