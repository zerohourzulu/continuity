# Keep revoked access revoked

An identity provider answers who signed in. The gateway's operator also needs to decide whether that person's assigned agent may still use this service. These are separate decisions: an already-issued access token may remain cryptographically valid after logout, and a refreshed token must not undo an operator's revocation.

`@ramex-labs/continuity-mcp-gateway/access-policy` provides a small local policy store for this purpose. It records approved issuer/user/client/binding assignments once, then adds durable denial records. It has no grant, un-revoke, migration or restore command.

```js
import {initializeAccessPolicy, openAccessPolicy}
  from '@ramex-labs/continuity-mcp-gateway/access-policy';

// One-time setup: the parent directory must already be private (0700).
const policy = initializeAccessPolicy({
  directory: '/private/operator-state/access',
  issuer: 'https://identity.example.com/',
  bindings: [{bindingId: 'analyst', subject: 'approved-user-id', clientId: 'registered-client'}],
});

// Pass this synchronous callback to serveGatewayHttp:
// isActive: policy.isActive
policy.revokeBinding('analyst');

// A restart opens existing state. Never initialize over it.
const reopened = openAccessPolicy({directory: '/private/operator-state/access'});
// The same binding remains denied, including with a newly issued token.
```

`revokeToken(identity)` denies one exact issuer/subject/client/binding/token-ID tuple. `revokeBinding(bindingId)` denies every token for that assignment. Both operations are idempotent. A token-only denial deliberately does not prevent a different valid token; use binding denial to stop renewal from restoring access. The operator must derive these identities from trusted configuration or verified tokens, not an agent's request for administration.

The callback rereads current private files on each check. Missing, corrupt, changed, replaced or inaccessible policy state refuses access. Records are created exclusively and fsynced; filenames use hashes. There are at most 16 configured bindings and a selected limit of 1,024 denial files. Exhaustion refuses another mutation and requires an operator decision; records are never pruned to make room. Serialize administrative mutation calls. Existing denial records continue to apply at capacity.

Keep this directory under the trusted host's control and outside an agent's filesystem access. Do not place it inside the gateway response directory. The latter's snapshot command does not back up this separate policy directory: operators must preserve both and must not restore an old copy over current revocations. Copying, deleting or rolling back trusted files can defeat this local policy; it is not tamper-proof storage, distributed consensus or a defense against a malicious administrator. Opening a deliberately substituted old directory after restart cannot prove freshness.

Gateway signature, exact audience, short token lifetime and Core runtime/role checks still apply independently. A policy callback returning true does not itself authorize a tool. Revocation cannot undo an action already delivered to a remote service.

The HTTP loopback issuer exception is for an isolated test only. This module does not implement OAuth login, key retrieval, token introspection, a provider logout webhook or an administrative network endpoint.
