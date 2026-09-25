# Protected evidence service — private H05 evaluation

This private build adds a fixed local evidence bundle to the existing cooperating destination. `createProtectedEvidenceDestination` returns the same signed write endpoint plus a private Unix reader socket and fixed tool registry. `readProtectedEvidence` is for the configured reviewer. The two write tools restrict or restore access to the configured bundle; callers cannot select arbitrary paths or implementations.

Core remains the exact private `@ramex-labs/continuity@0.3.0-h04.1` dependency. This package is `private:true`; it is not an npm publication decision. The gateway and evidence MCP packages are unchanged. The complete source package contains the executable story and Linux boundary instructions in `examples/protected-evidence/README.md`.

Access state and its applied result share one durable transaction. Every fresh read checks current state; missing/corrupt/uncertain storage refuses it. Earlier authorized deliveries can finish after closure. Already delivered copies cannot be recalled. This is a trusted local POSIX profile, not a public network endpoint, hostile-host containment or complete agent sandbox.

The continuation profile is explicitly selected, finite (1,024 events / 6 MiB), fully replayed from genesis, and preserves spent authority and open duties. See HISTORY.md for the existing migration and checkpoint contract. A late report does not prove the external outcome or complete an investigation duty.
