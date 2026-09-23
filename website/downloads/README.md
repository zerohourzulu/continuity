> **Core 0.3 preview:** [Build a fresh case](https://github.com/zerohourzulu/continuity/blob/main/docs/CORE-0.3-QUICKSTART.md), [connect approved MCP tools](https://github.com/zerohourzulu/continuity/blob/main/docs/MCP-GATEWAY.md), or [run the public tests](https://github.com/zerohourzulu/continuity/blob/main/docs/CORE-0.3-TESTING.md). The original 0.2.2 evaluation releases remain available.

[![it is 2 a.m. do you know what your agent is doing?](https://github.com/zerohourzulu/continuity/blob/main/website/images/agent-at-2am.png)](https://zerohourzulu.github.io/continuity/)
[![Security. Control. Inheritance. Durable survival of powers and responsibilities. Record durably, locally or on chain. This is your agent’s brain on Continuity.](https://github.com/zerohourzulu/continuity/blob/main/assets/continuity-statement.svg)](https://zerohourzulu.github.io/continuity/)

# Continuity — agents change; responsibility remains

**[Explore the interactive demo →](https://zerohourzulu.github.io/continuity/)** · [Start here](https://github.com/zerohourzulu/continuity/blob/main/docs/START-HERE.md) · [Developer guide](https://github.com/zerohourzulu/continuity/blob/main/docs/DEVELOPER.md) · [Security and limits](https://github.com/zerohourzulu/continuity/blob/main/SECURITY.md)

**[Try your own choices in the playground →](https://continuity.ramex.com/playground/)** No installation or account needed.

**Developer preview · Apache 2.0.** [Release status](https://github.com/zerohourzulu/continuity/blob/main/RELEASE-STATUS.md).

A process supervisor can start Agent B. Continuity records which role B occupies, which powers it has, what happened before, and which unfinished duties survive the change. A replacement receives its explicitly granted powers; an unfinished duty does not silently grant more authority.

The demonstration follows a security investigation interrupted by an agent replacement. The old request is refused, the investigation stays OPEN, and the successor’s review permission is checked independently.

## Choose your path

| You want to… | Start here | What you will learn |
|---|---|---|
| Understand the idea without installing anything | [The story and answer key](https://github.com/zerohourzulu/continuity/blob/main/docs/READ-THE-RESULT.md) | Why an unfinished duty and permission are separate. |
| Run and inspect a replacement | [Tutorial](https://github.com/zerohourzulu/continuity/blob/main/docs/TUTORIAL.md), then [operator commands](https://github.com/zerohourzulu/continuity/blob/main/docs/OPERATOR.md) | What was refused, who holds the duty and what B may do. |
| Evaluate or integrate the code | [Core 0.3 quickstart](https://github.com/zerohourzulu/continuity/blob/main/docs/CORE-0.3-QUICKSTART.md) | Create your own permissions, try a protected tool, then connect a framework or policy engine. |

## Run the tutorial

Use **Node 22.18+ (22.x), 24.x or 26.x** on macOS or Linux. Prefer the latest patch of your chosen release. No global pnpm or Python is needed for this tutorial. [Full quickstart, including archive extraction](https://github.com/zerohourzulu/continuity/blob/main/docs/QUICKSTART.md).

Get the public source; no GitHub account is needed:

<!-- quickstart:clone -->
```sh
git clone https://github.com/zerohourzulu/continuity.git
cd continuity
```
<!-- /quickstart -->

**See the result first, without installing dependencies:**

<!-- quickstart:recorded -->
```sh
node examples/recorded.mjs
```
<!-- /quickstart -->

Expect ALLOW for reviewing the investigation and DENY for collecting another packet. This inspects a bundled recorded case; it does not execute a new action.

**Generate your own evidence:**

<!-- quickstart:run -->
```sh
node tools/setup.mjs
node tutorial/start.mjs
```
<!-- /quickstart -->

Expect **PASS — duty remains OPEN; B has no collection power**, then **VERIFIED**. Setup downloads locked dependencies with scripts disabled. The tutorial then runs locally using synthetic data and public test keys. It prints your new case name and exact follow-up commands. Rerunning creates another case and preserves earlier evidence.

Change one permission:

<!-- quickstart:compare -->
```sh
node tutorial/start.mjs --deny-review
```
<!-- /quickstart -->

B still inherits the duty, but its review permission becomes DENY. [Expected output and explanation](https://github.com/zerohourzulu/continuity/blob/main/docs/TUTORIAL.md) · [Setup checks and recovery](https://github.com/zerohourzulu/continuity/blob/main/docs/TROUBLESHOOTING.md).

## Choose your holder of record.

Keep records locally, or choose a chain-backed deployment to make selected history publicly verifiable. Cryptographic commitments can let authorized reviewers check private records without publishing their contents. This tutorial runs locally; each deployment has its own privacy, availability and finality requirements.

## Explore and build

| Your next step | Where to go |
|---|---|
| See the idea and recorded comparison | [Interactive demo](https://zerohourzulu.github.io/continuity/) |
| Inspect your new run and optional recorded Linux evidence | [Operator guide](https://github.com/zerohourzulu/continuity/blob/main/docs/OPERATOR.md) |
| Integrate an authority check | [Developer guide](https://github.com/zerohourzulu/continuity/blob/main/docs/DEVELOPER.md) · [Executable reader example](https://github.com/zerohourzulu/continuity/blob/main/examples/read-investigation.mjs) |
| Try optional native enforcement mechanics | [Disposable Linux lab](https://github.com/zerohourzulu/continuity/blob/main/docs/LINUX-LAB.md) |
| Review source provenance and validation | [Validation](https://github.com/zerohourzulu/continuity/blob/main/VALIDATION.md) · [Presentation checks](https://github.com/zerohourzulu/continuity/blob/main/docs/PRESENTATION-VALIDATION.md) · [Provenance](https://github.com/zerohourzulu/continuity/blob/main/SOURCE-PROVENANCE.json) |
| Extend the presentation | [Website maintenance](https://github.com/zerohourzulu/continuity/blob/main/docs/WEBSITE.md) |

Presentation maintainers can find the separate owner-private edition in [website maintenance](https://github.com/zerohourzulu/continuity/blob/main/docs/WEBSITE.md). The public walkthrough needs no account.

## Contribute and explore

Read the [short development history](https://github.com/zerohourzulu/continuity/blob/main/docs/DEVELOPMENT-HISTORY.md) from Core 0.1 to the current reference implementation. [Contributions](https://github.com/zerohourzulu/continuity/blob/main/CONTRIBUTING.md) and [public RFCs](https://github.com/zerohourzulu/continuity/blob/main/docs/RFC.md) are welcome; an RFC is useful for changes to protocol behavior or security boundaries.

## Scope

Core 0.2.2 is local reference software. It is not a hostile-agent sandbox, production credential system or autonomous cyber defender. The website selects recorded results; the downloaded tutorial executes Core. Real integrations must mediate every consequential operation through a protected executor. [Security boundaries](https://github.com/zerohourzulu/continuity/blob/main/SECURITY.md).

The source, tutorial, tests, reader and website are included here and in the complete evaluation download. Earlier editions remain available as historical releases; use evaluation.6 for the commands above. [Package overview](https://github.com/zerohourzulu/continuity/blob/main/docs/PACKAGE-OVERVIEW.md) · [Presentation provenance](https://github.com/zerohourzulu/continuity/blob/main/PRESENTATION-PROVENANCE.json).

[Release status and licensing](https://github.com/zerohourzulu/continuity/blob/main/RELEASE-STATUS.md) · [Apache 2.0 license](https://github.com/zerohourzulu/continuity/blob/main/LICENSE) · [Third-party notices](https://github.com/zerohourzulu/continuity/blob/main/THIRD-PARTY-NOTICES.md)

## Embed the engine

Try the [standalone developer package](https://github.com/zerohourzulu/continuity/blob/main/docs/SDK-QUICKSTART.md): install the supplied JavaScript SDK tarball in a separate application, create one authorized synthetic packet, and inspect why refused requests create none. Includes TypeScript declarations and an offline consumer check. This is an evaluation interface around unchanged Core0.2.2.

## Shared Core integration preview

The [shared-package preview](https://github.com/zerohourzulu/continuity/blob/main/docs/SHARED-CORE.md) connects the cooperating remote tools and MCP evidence tool to one Core dependency. Try [native LangChain tools and lost-reply recovery](https://github.com/zerohourzulu/continuity/blob/main/packages/remote-tools/README.md), or the [MCP evidence tool](https://github.com/zerohourzulu/continuity/blob/main/docs/MCP-PACKAGE.md).
