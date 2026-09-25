# A real sign-in test

The gateway has been exercised with **Keycloak 26.7.4**, **openid-client 6.8.8** and an isolated **Chrome 153** browser session. The test used an actual authorization-code and PKCE login, actual issuer signatures and refresh tokens, and synthetic incident work. It did not use a password grant in place of the user's browser login.

The test demonstrated:

- Login can admit one approved tool action. Renewing the login and reconnecting finds the original result without sending the action again.
- Reused authorization codes, wrong PKCE verifiers and used refresh tokens are refused.
- ID tokens and refresh tokens cannot act as gateway access tokens.
- Operator binding revocation rejects both existing and newly refreshed tokens, including after gateway restart.
- Disabling the test user prevents refresh. Signing-key rotation requires an explicitly reviewed key change; unknown and removed keys are refused.

Expiry was checked using an actual signed issuer token at its expiry boundary with a controlled verifier clock. That is not a measurement of clock synchronization or a long-running service test. The earlier Inspector and mcpc checks used configured bearer tokens; they did not prove those applications' interactive OAuth support.

## Configure the issuer deliberately

The disabled, secret-free [realm template](examples/keycloak-realm.json) shows the settings used for the local test. Create a dedicated lab instance; do not import it into an existing production realm. It contains no users, credentials or signing keys. Configure a disposable user with required profile fields, then pin that user's stable subject and the issuer's reviewed public ES256 key in gateway configuration before enabling access.

The client has an exact callback, S256 PKCE, a two-minute access-token lifetime and one fixed resource audience. Its explicit subject mapper is essential: removing default Keycloak scopes otherwise removes `sub` from access tokens. Keep the explicit `client_id` and administrator-controlled `continuity_binding` mappers. Do not replace these with editable profile attributes or values copied from client requests. Different browser users must not be automatically enrolled into the same gateway binding.

The template uses loopback addresses and a pre-registered native test client. It does not configure arbitrary desktop applications, a public TLS endpoint or a hosted identity service. Keycloak/client setup is separate from the gateway's normal installation; the normal demos continue to use a synthetic issuer and require no Keycloak installation. For durable operator denial, see [access policy](ACCESS-POLICY.md).

## A measured compatibility limit

Keycloak documents incomplete OAuth resource-indicator support. The test confirmed that a request naming a different resource still received the configured fixed audience. The gateway continued to enforce its own exact audience. This is a useful local identity profile, **not complete modern MCP authorization-stack conformance**. Do not advertise generic HTTP-client interoperability based on this test.

Before choosing public deployment, resolve the intended resource-parameter behavior and test the actual client, issuer, proxy, TLS and revocation operations together. No token translation service or relaxed gateway check is hidden in this example.

Sources: [Keycloak MCP integration](https://www.keycloak.org/securing-apps/mcp-authz-server), [Keycloak subject mapper](https://github.com/keycloak/keycloak/blob/26.7.4/services/src/main/java/org/keycloak/protocol/oidc/mappers/SubMapper.java), [openid-client](https://github.com/panva/openid-client).
