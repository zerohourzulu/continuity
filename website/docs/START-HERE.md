> Want to build a fresh integration? Try the [Core0.3 quickstart](https://github.com/zerohourzulu/continuity/blob/main/docs/CORE-0.3-QUICKSTART.md) or the [protected MCP tool](https://github.com/zerohourzulu/continuity/blob/main/docs/MCP-PACKAGE.md). The recorded story below remains a good first look.

# The helper changes. What happens to the unfinished job?

A security team asks software helper A to gather a packet and review it. A gathers the packet, but the review is still unfinished when the team replaces A with B.

Starting B does not answer three practical questions: what may B do, which old requests should now be refused, and who is assigned the work that remains? Continuity keeps those questions separate.

Prefer a picture and a slower walkthrough? [Read the illustrated explanation](https://github.com/zerohourzulu/continuity/blob/main/README-ELI5.md).

[Try different choices in the browser playground](https://continuity.ramex.com/playground/), then open the workshop to inspect the results.

## What happens in the tutorial

1. A's permitted collection request runs in the simulator. The record shows a review duty as `OPEN`: it is not finished.
2. The operator assigns the remaining work to B and changes A's recorded control status. This does not kill an operating-system process.
3. The operator revokes A's collection permission. The old signed collection request is refused before the component that would carry it out is called.
4. B can review the existing packet, but cannot collect another. Removing B's review permission leaves the unfinished duty in the record.
5. A fresh process reads the saved events and finds the same history and unfinished duty.

No AI model is needed: A and B are test identities and signed requests driven by a small program.

## What an answer tells you

A valid signature identifies who signed the test request. An authorization decision says what the supplied rules and history allow. An executor acknowledgment records what the component carrying out the action reported. These are different facts. None proves that the investigation is finished or that a suspected incident really happened.

[Read the result](https://github.com/zerohourzulu/continuity/blob/main/docs/READ-THE-RESULT.md) · [Run it](https://github.com/zerohourzulu/continuity/blob/main/README.md#run-the-tutorial) · [Detailed stages](https://github.com/zerohourzulu/continuity/blob/main/docs/TUTORIAL.md) · [Build an integration](https://github.com/zerohourzulu/continuity/blob/main/docs/DEVELOPER.md)
