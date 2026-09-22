> **Public evaluation — v0.2.2-evaluation.6.** Core remains 0.2.2. Runnable verification, a bounded reader and connected user journeys. [Release notes](RELEASE-NOTES.md) · [Run the tests](docs/TESTING.md) · [Reader/CLI/MCP](docs/READER.md).

[![it is 2 a.m. do you know what your agent is doing?](website/images/agent-at-2am.png)](https://zerohourzulu.github.io/continuity/)
[![Security. Control. Inheritance. Durable survival of powers and responsibilities. Record durably, locally or on chain. This is your agent’s brain on Continuity.](assets/continuity-statement.svg)](https://zerohourzulu.github.io/continuity/)

# Continuity — agents change; responsibility remains

**[Explore the interactive demo →](https://zerohourzulu.github.io/continuity/)** · [Start here](docs/START-HERE.md) · [Developer guide](docs/DEVELOPER.md) · [Security and limits](SECURITY.md)

**Public maintenance evaluation · Apache 2.0.** [Release status](RELEASE-STATUS.md).

A process supervisor can start Agent B. Continuity records which role B occupies, which powers it has, what happened before, and which unfinished duties survive the change. A replacement receives its explicitly granted powers; an unfinished duty does not silently grant more authority.

The demonstration follows a security investigation interrupted by an agent replacement. The old request is refused, the investigation stays OPEN, and the successor’s review permission is checked independently.

## Choose your path

| You want to… | Start here | What you will learn |
|---|---|---|
| Understand the idea without installing anything | [The story and answer key](docs/READ-THE-RESULT.md) | Why an unfinished duty and permission are separate. |
| Run and inspect a replacement | [Tutorial](docs/TUTORIAL.md), then [operator commands](docs/OPERATOR.md) | What was refused, who holds the duty and what B may do. |
| Evaluate or integrate the code | [Developer path](docs/DEVELOPER.md) | Run checks, change one policy input, call the bounded reader and MCP. |

## Run the tutorial

Use **Node 22.18+ (22.x), 24.x or 26.x** on macOS or Linux. Prefer the latest patch of your chosen release. No global pnpm or Python is needed for this tutorial. [Full quickstart, including archive extraction](docs/QUICKSTART.md).

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

B still inherits the duty, but its review permission becomes DENY. [Expected output and explanation](docs/TUTORIAL.md) · [Setup checks and recovery](docs/TROUBLESHOOTING.md).

## Choose your holder of record.

Keep records locally, or choose a chain-backed deployment to make selected history publicly verifiable. Cryptographic commitments can let authorized reviewers check private records without publishing their contents. This tutorial runs locally; each deployment has its own privacy, availability and finality requirements.

## Explore and build

| Your next step | Where to go |
|---|---|
| See the idea and recorded comparison | [Interactive demo](https://zerohourzulu.github.io/continuity/) |
| Inspect your new run and optional recorded Linux evidence | [Operator guide](docs/OPERATOR.md) |
| Integrate an authority check | [Developer guide](docs/DEVELOPER.md) · [Executable reader example](examples/read-investigation.mjs) |
| Try optional native enforcement mechanics | [Disposable Linux lab](docs/LINUX-LAB.md) |
| Review source provenance and validation | [Validation](VALIDATION.md) · [Presentation checks](docs/PRESENTATION-VALIDATION.md) · [Provenance](SOURCE-PROVENANCE.json) |
| Extend the presentation | [Website maintenance](docs/WEBSITE.md) |

Presentation maintainers can find the separate owner-private edition in [website maintenance](docs/WEBSITE.md). The public walkthrough needs no account.

## Contribute and explore

Read the [short development history](docs/DEVELOPMENT-HISTORY.md) from Core 0.1 to the current reference implementation. [Contributions](CONTRIBUTING.md) and [public RFCs](docs/RFC.md) are welcome; an RFC is useful for changes to protocol behavior or security boundaries.

## Scope

Core 0.2.2 is local reference software. It is not a hostile-agent sandbox, production credential system or autonomous cyber defender. The website selects recorded results; the downloaded tutorial executes Core. Real integrations must mediate every consequential operation through a protected executor. [Security boundaries](SECURITY.md).

The source, tutorial, tests, reader and website are included here and in the complete evaluation download. Earlier editions remain available as historical releases; use evaluation.6 for the commands above. [Package overview](docs/PACKAGE-OVERVIEW.md) · [Presentation provenance](PRESENTATION-PROVENANCE.json).

[Release status and licensing](RELEASE-STATUS.md) · [Apache 2.0 license](LICENSE) · [Third-party notices](THIRD-PARTY-NOTICES.md)

## Embed the engine

Try the [standalone developer package](docs/SDK-QUICKSTART.md): install the supplied JavaScript SDK tarball in a separate application, create one authorized synthetic packet, and inspect why refused requests create none. Includes TypeScript declarations and an offline consumer check. This is an evaluation interface around unchanged Core0.2.2.
