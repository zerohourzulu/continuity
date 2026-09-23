# Easier local MCP client setup

Source `v0.3.0-preview.7.8` adds a [client-configuration helper and walkthrough](docs/MCP-CLIENT-SETUP.md). It prints VS Code, Claude Desktop or portable JSON with full Node/program/configuration paths. It reads installed package metadata and checks case-file privacy, but does not read keys or case contents, start tools, edit settings or create permissions.

The helper supports the existing gateway npm preview.7 on Node 22.18+ (22.x) and Node 24, macOS/Linux. Generated launch commands are tested through the SDK, including paths with spaces. These are not desktop GUI compatibility claims. Existing npm packages, gateway runtime and Registry entries remain unchanged; no new npm installation prompt or public HTTP service is introduced.
