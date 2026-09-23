# Try a different choice

The playground has two views of one case. **Story** follows an unfinished review through a recorded replacement. **Workshop** lets you add helpers, assign roles, grant or withdraw permissions, check an operation, compare answers and download the case.

Open `index.html` through an HTTP server; opening it directly as a file does not provide the module-worker environment. From the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory website
```

Visit `http://127.0.0.1:8000/playground/`. Stop the server with Ctrl-C. No hosted engine, account, telemetry or paid service is needed. The site can be served as static files by a hosting provider of your choice.

## Things to try

1. Keep the normal review result for comparison. Withdraw the replacement's original review permission and check again. The answer changes; the unfinished job remains.
2. Choose the old helper and ask to collect another packet after the handover.
3. Open the incident-room starting point. Give one helper a role without selecting any operations. A title alone grants no power.
4. Add an explicit permission for that helper, then withdraw it, expire it, or add a stop rule. Another valid permission can still matter; an applicable global prohibition blocks the request.
5. Rename the case and helpers, add agents and roles, download the scenario, then reopen it. Switch views without losing your settings.

## Bounds and meaning

- 2–12 named agents; eight roles including the recorded investigator; 12 operation choices; seven optional exclusive role assignments; up to 32 direct permission entries.
- Each role template creates an appointment **and separate grants to its selected agent**. Core does not infer permission from the role title. Selecting no operations creates an appointment with no extra grant.
- Four recorded stages and six starting scenarios. The two original identities and the one original duty retain their signed identifiers. Names are display labels. Additional agents, grants and prohibitions are newly constructed synthetic events after the chosen prefix; the engine checks their effect.
- Up to 224 events per constructed run. Input is a closed JSON format, at most 32 KB, eight levels and 2,048 values. The interface terminates a worker after 20 seconds rather than displaying an old answer.
- You act as the scenario designer. Adding rules is trusted hypothetical setup, not a demonstration that an agent may administer policy.
- The hypothetical operations, such as quarantining a file, are permission questions. There is **no file quarantine implementation**, new signed transaction execution, autonomous agent, general workflow builder or production enforcement in this playground.
- Rewinding and changing settings create a new experimental branch. They never edit the stored signed example. Event history distinguishes recorded events from experiment events. Results use history time, not current wall-clock freshness.

The drawn helpers represent software identities. “Ended in this record” is protocol status, not proof that an operating-system process stopped. An ALLOW observation is not a capability to execute later.

## Check the same case outside the browser

In the workshop, download the scenario and its result. With the full repository available and its supported Node runtime, run:

```sh
node tools/playground.mjs continuity-scenario.json > node-result.json
```

This uses the unchanged original Node SDK, not the browser host profile. Compare `node-result.json` with the downloaded result. The scenario, decisions, head hash and events should agree. It does not create any external effects.

Run the focused checks from the repository root:

```sh
node --test tests/browser/model.test.mjs tests/browser/vectors.test.mjs
```

For independent browser checks, serve the **repository root** on loopback and visit `http://127.0.0.1:8000/tests/browser/`. That page checks the existing conformance vectors and the new scenarios without a browser-test package. It is a developer test page, not included in the deployed website directory.

## Browser execution boundary

The worker accepts JSON **text only** and parses it with the existing strict parser, rejecting duplicate keys and excessive structure. No imported code, custom engine, arbitrary module URL, adapter, signing credential or uploaded event history is accepted. All further objects come from that parser or trusted local engine/scenario code.

The Node reference uses `util.types.isProxy`. This browser evaluation profile replaces only the two `node:util` imports with a named host profile that conservatively rejects non-structured-cloneable values. It is not a general replacement for Node's hostile-object defenses: cloning can invoke accessors, which is why the byte-only worker boundary is required. Do not use these browser modules as a general SDK for arbitrary JavaScript objects. The original Node SDK remains unchanged.

[MDN's worker documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) explains the separate execution context and termination API; [structured cloning](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm) describes the supported data transfer. These platform mechanisms do not make this a hostile-agent sandbox or protect a compromised browser or hosting origin.

`tools/build-playground.mjs` regenerates the copied engine modules, original fixture and strict parser. [ENGINE-PROVENANCE.json](ENGINE-PROVENANCE.json) records source/output hashes and the explicit host-import adaptations. This is an evaluation profile over Core 0.2.2, not a new Core version.


## How this relates to Core 0.3

The playground is a what-if replay over the preserved Core 0.2.2 example. Its 224-event construction bound is separate from Core 0.3’s 96-event managed history profile. It does not admit jobs, reserve recovery space or provide a way around a live gateway’s limits. Rewinding a practice scenario cannot undo an actual revocation, consumed limit or unfinished duty. For running tools, use the [current gateway guide](https://github.com/zerohourzulu/continuity/blob/main/docs/MCP-GATEWAY.md) and [capacity guide](https://github.com/zerohourzulu/continuity/blob/main/docs/LOCAL-CAPACITY.md).
