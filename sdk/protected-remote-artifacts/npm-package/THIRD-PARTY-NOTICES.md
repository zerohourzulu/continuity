# Third-party dependencies

The base package uses Node built-ins and depends on the separately installed Apache-2.0 shared Core package. It contains no engine copy.

The optional LangChain entry uses separately installed `@langchain/core` 1.2.12 and `zod` 4.6.5, both MIT licensed. The walkthrough uses separately installed `viem` 2.55.19, also MIT licensed, to create disposable example signing keys. Their packages and transitive dependencies retain their own license files. No dependency code is copied into this archive.

The source build uses TypeScript 5.9.3 (Apache 2.0) and Node type declarations (MIT); those development tools are not included in the runtime package. Node is supplied separately under its own license.
