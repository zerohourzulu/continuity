# Optional native Linux mechanics lab

This advanced path is separate from the easy tutorial. Use a disposable Linux VM that you administer, with no operational keys or workloads. It builds the retained native binding and runs its existing focused mechanics check. It does not launch the full broker, run an AI agent or reproduce the complete recorded multi-user episode.

Prerequisites: Linux with `openat2` support (5.6 or later), an actual ext4 scratch filesystem, Node 24 and matching Node headers, Python 3, and a C++17 compiler. Obtain these through your VM distribution/Node installation. The main tutorial does not need them. macOS and Windows do not support this native path; use the main tutorial on macOS instead.

Check `node --version`, `c++ --version`, and the availability of `node_api.h`. Set `NODE_INCLUDE_DIR` if your Node headers are not in `/usr/include/node`.

From the package root, build as your ordinary lab user:

```sh
sh integrations/document-release-native/build.sh
```

The build emits `integrations/document-release-native/build/document_release.node`. Read the [native contract](https://github.com/zerohourzulu/continuity/blob/main/integrations/document-release-native/README.md) before the next step.

Create a new private scratch directory under a safe home (not `/tmp`, not a shared mount or symlink). All ancestors must be owned by root or your user, not group/world writable, and without access/default ACLs. The path must be on ext4. Use a new directory name for every run:

```sh
mkdir -m 700 "$HOME/continuity-native-scratch-01"
findmnt -T "$HOME/continuity-native-scratch-01" -n -o FSTYPE
node integrations/document-release-native/linux-check.cjs "$HOME/continuity-native-scratch-01"
```

Proceed with the Node command only if `findmnt` reports `ext4` and the ownership/ACL prerequisites hold. Run the check as the ordinary non-root user, never with sudo. The script refuses root and a nonempty scratch directory. It creates harmless scratch bytes, performs one local publication by rename, and checks no overwrite, alias refusal, locks, socket credentials, extra packets and expiry. Outputs remain for inspection. No machine-wide setup script or automatic cleanup is provided.

A successful check emits its JSON result and exits 0. A refusal is a useful boundary result, not permission to weaken the checks. Read the error and provision a new suitable scratch directory. Do not rerun over retained output or use a real document path.

This release includes the unchanged source and prior recorded guide evidence. Fresh native compilation/mechanics execution is **not** part of its public tutorial acceptance claim; the clean-checkout acceptance covers the portable tutorial on the platforms recorded in VALIDATION.md. Full hostile-host containment, production custody and arbitrary crash recovery remain outside scope.
