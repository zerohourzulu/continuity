# The complete Continuity evaluation package

Start with the [quickstart](QUICKSTART.md): get the package, inspect recorded ALLOW/DENY using Node alone, then generate your own synthetic case. No wallet, model account or chain node is required.

| Path | Purpose |
|---|---|
| [README](../README.md) / [illustrated explanation](../README-ELI5.md) / [website](../website/index.html) | The idea and paths into the software. |
| [Tutorial](TUTORIAL.md) / `tutorial/` | New synthetic histories, fresh case names and inspection. |
| [Operator](OPERATOR.md) / [Reader](READER.md) | Bounded observation of retained history; not an execution capability. |
| [Developer](DEVELOPER.md) / `packages/core-0.2/` | Reference engine and integration boundaries. |
| [Testing](TESTING.md) / `tests/` / `conformance/` | Test changes and diagnose setup failures. |
| [Optional Linux lab](LINUX-LAB.md) | Separate native mechanics with additional prerequisites. |
| `website/source/` | Historical subset supporting recorded-guide links; not the current setup entry. |

`node tools/verify-package.mjs` verifies an untouched package against `PACKAGE-FILES.json`. Source changes are tested with `node tools/test.mjs`; they are not expected to match the original distribution hash. Generated runs and installed dependencies are excluded from the package index.

Core0.2.2 remains local reference software: no hostile-agent sandbox, production credential service or autonomous defender. [Security](../SECURITY.md) · [License](../LICENSE) · [Provenance](../SOURCE-PROVENANCE.json).

The developer package includes `sdk/core/` (generated JavaScript/declarations), its local npm tarball, `tools/sdk-build/` (separately locked build tooling), and `examples/sdk-consumer/` (standalone protected packet example). [Start here](SDK-QUICKSTART.md). No npm publication is required.
