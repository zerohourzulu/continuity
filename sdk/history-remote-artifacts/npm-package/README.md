# Continuity remote tools — private H04 evaluation

Version 0.3.0-h04.1, requiring Core 0.3.0-h04.1. Not an npm release.

The existing client/executor/recovery APIs and native LangChain tools remain. A trusted host can now select `continuity-segmented-local/1` with an explicitly migrated history binding. The cooperating destination uses independently replayed, durable staged checkpoints and a separately migrated `/2` storage format. Legacy file configurations retain their original behavior and limits.

Read [HISTORY.md](HISTORY.md) for setup, migration, idempotent transfer retries, interruption recovery, limits and an installed-package test. Host keys, paths and business identities are never model-selected arguments. This service records synthetic local effects; it is not an arbitrary external-system connector. Late reports do not establish factual truth or discharge duties.

The included older examples use the default legacy file profile. Their public npm installation commands refer to that public preview, not this private tuple. Use the three local H04 tarballs to evaluate continuation. Publication and Linux release assessment remain separate.
