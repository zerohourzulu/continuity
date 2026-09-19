#!/bin/sh
set -eu
cd "$(dirname "$0")"
[ "$(uname -s)" = Linux ] || { echo 'Linux required' >&2; exit 1; }
NODE_INCLUDE_DIR=${NODE_INCLUDE_DIR:-/usr/include/node}
test -r "$NODE_INCLUDE_DIR/node_api.h"
mkdir -p build
"${CXX:-c++}" -std=c++17 -O2 -fPIC -shared -Wall -Wextra -Werror -D_GNU_SOURCE -DNAPI_VERSION=8 -I"$NODE_INCLUDE_DIR" native.cc -o build/document_release.node
