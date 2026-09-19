# An agent is temporary. Its unfinished work may not be.

Imagine a security team asks agent A to collect a small evidence packet and review it. A has explicit permission for that task. The investigation is still open when the team replaces A with B.

A process supervisor can start B. Continuity answers a different set of questions: which authority is current, which old requests must be refused, and which recorded duties still exist?

In this tutorial:

1. A's selected collection request is allowed. The simulator acknowledges it; a review duty is recorded as OPEN.
2. The operator hands over the role. A's control epoch changes, A is terminated in the protocol, and B receives the performance assignment. This does not kill an OS process.
3. The operator explicitly revokes A's collection grant. A's old signed request is refused before executor invocation.
4. B holds the unfinished duty, with only its separately declared powers. B cannot collect another packet. B's review permission can also be revoked without deleting the duty.
5. A new process replays the retained events and sees the same history head and OPEN duty.

The agents here are identifiers and signed requests driven by a small program. You do not need to install an AI model. Models may propose work in a future integration; they do not decide whether a grant or signature is valid.

**Three different facts:** a valid signature identifies the fixture signer; an authorization decision says what the declared rules allow; an acknowledgment records the executor's stated result. None proves the investigation was completed or the incident allegation was true.

[Run it](../README.md#run-the-tutorial) · [See the stages](TUTORIAL.md) · [Inspect the implementation](DEVELOPER.md)
