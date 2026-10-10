# Leave, reconnect, and find the same job

A long-running job should not depend on keeping one chat window open. This preview gives the client a durable task handle. Reconnect with a valid login, present the same handle, and inspect the original job. A handle is a reference, not permission.

## Try it

```sh
npm ci --ignore-scripts
npm run demo:tasks
```

Use Node 22.18+ on the 22 line or Node 24. The example creates one synthetic ticket, loses its reply, reconnects, recovers the result and restarts the gateway. It verifies that only one commit request was sent. No model account or external service is needed. It removes its disposable files and keys when done.

## Enable it deliberately

For a cooperating HTTP binding, add `tasks: true`:

```js
bindings: [{
  id: 'incident-analyst',
  subject: 'user-42',
  clientId: 'approved-client',
  kind: 'cooperative',
  tasks: true,
  gateway: cooperatingGatewayOptions,
}]
```

The objects above belong to your application. See `examples/tasks-demo.mjs` for a complete example and [HTTP.md](HTTP.md) for the login contract. Ordinary bindings and the stdio CLI keep their existing behavior.

This profile follows the [MCP Tasks extension, revision 2026-07-28](https://tasks.extensions.modelcontextprotocol.io/specification/2026-07-28/tasks). Clients declare `io.modelcontextprotocol/tasks` in each request's capability metadata. The server may then return `resultType: "task"` from a tool call. Clients poll `tasks/get`; `tasks/cancel` requests cancellation and `tasks/update` supplies requested inputs. Task routing uses the task ID in `Mcp-Name`. Cancellation acknowledgment does not promise cancellation succeeded. The extension uses task status rather than ordinary progress notifications.

The installed TypeScript SDK's old experimental Tasks types are not this protocol. A narrow HTTP extension handler implements the selected current shape, while the existing SDK still handles discovery and ordinary MCP calls. `examples/task-client.mjs` is a small working wire client. Use a client that supports this revision; do not substitute old `tasks/result` or `tasks/list` commands.

## Progress you can trust

A task reports stages: checking permission, checking the destination fence, preparing the job, or awaiting the original result. These messages describe gateway activity. They are not invented completion percentages or proof that the destination has finished.

A completed task carries the normal tool result. Read that result: a completed tool call can still contain an error. An unresolved destination outcome stays `working`, with an explanation. PENDING means prepared work exists; this edition supports inspection and cancellation, but does not expose a command to resume its commit.

One fixed business job has one task handle, regardless of retries or trusted tool-alias changes. Changed arguments are refused. The request is durably saved before the handle is returned or execution launches. A second request finds that record instead of starting another execution. Only one execution can be active in a gateway context; another new job receives BUSY.

## What “resume” means here

After a client disconnect, the original request may continue while its original login and Core authority remain valid. A later login can inspect its outcome. Expired or revoked access stops subsequent dispatch checks and disclosure; it does not undo work already sent.

After a gateway crash, polling resumes from saved records. The gateway may ask the cooperating service for signed status. It **never restarts the original effect automatically**, even if the saved record suggests a crash happened before admission. Ambiguous work remains visible instead of being silently repeated. This sacrifices automatic completion in uncertain cases to preserve the one-job boundary.

Every poll checks current login, runtime, role and inspection permission. A task ID obtained from another caller is not usable. HTTP bindings still have separate cases. Task results remain subject to the same [signed recovery rules](RECOVERY.md).

## Cancellation has limits

`tasks/cancel` checks the separate cancellation grant before recording the request. The request marker stops the running gateway from entering another outgoing phase. Once the current phase returns, the gateway uses the separately admitted cancellation operation to ask the destination to stop pending work. A queued job with no original admission can be cancelled locally without sending a destination request.

An acknowledgment means the request was recorded. Poll to find out what happened. If the effect already happened, the task completes with that result. If the service reports CANCELLED, the task becomes cancelled. Lost replies remain uncertain until a status lookup resolves them. Cancellation retry never repeats a previously admitted destination cancellation.

A revoked or expired login can prevent the background cancellation from proceeding. A currently authorized caller can request cancellation again; this resumes the cancellation procedure without granting new original execution power. No task input response can create a permission, change arguments or choose a destination.

## Supported profile

Polling only, authenticated loopback HTTP, cooperating destination, fixed jobs and trusted local storage. No subscriptions, task status push, input requests, generic background worker pool, public HTTP service or old experimental Tasks compatibility. The server requests no client input and ignores responses to unissued input keys. Task records have no timed deletion; retention is bounded by the configured job count, currently 32. Poll about once a second and preserve handles in your own client state.

Task records share the private job directory. Capacity limits from [RECOVERY.md](RECOVERY.md) still apply, including Core256/observation128 events. Restart does not recover capacity. No pruning, restore-from-old-backup safety or arbitrary external-service atomicity is added. The supplied HTTP host enforces one gateway owner per case. Follow [OPERATIONS.md](OPERATIONS.md) to recover a dead owner and inspect finite capacity.
