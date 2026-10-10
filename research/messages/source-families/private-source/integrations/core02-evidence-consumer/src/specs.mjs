const freeze = value => { if(value && typeof value === "object") { for(const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
const specs = freeze({
  "core02-packet": {
    "profile": "core02-packet",
    "caseId": "core02-packet-r1",
    "catalogId": "core02-packet-retained-2026-09-11-r1",
    "catalogSha256": "edaab345037e8ae489197ff0e8d01305a223e323b17809c05fcab0d82e32b115",
    "sourceEdition": "continuity-core/0.2.0",
    "verifierId": "continuity-core/0.2",
    "coreVersion": "0.2",
    "packageVersion": "0.2.0",
    "domain": {
      "chainId": "31337",
      "deploymentId": "core-0.2-reference:core02-packet-r1",
      "protocol": "continuity",
      "verifyingContract": "0x0000000000000000000000000000000000003002",
      "version": "0.2"
    },
    "head": {
      "canonicalTime": 25,
      "hash": "0x926212fcc391169c5934cecca2f546a759335451ff1837a148ac9e62de264725",
      "position": 25
    },
    "adapterProfile": {
      "descriptorHash": "0xd4b988c1f23603cf35d9abd0db5a7eb56ef7a5fba1a8f3e904490c1ce4458d64",
      "profileId": "adapter:local-evidence-packet",
      "profileVersion": "1"
    },
    "exportManifestSha256": "73de27029e09135c0704f95fd8be2dfa122e15050bf9278d1c0778423759bade",
    "evidenceIds": [
      "summary",
      "history",
      "graph",
      "queries",
      "terms",
      "reviewProgress",
      "receipt",
      "receiptVerification",
      "admission",
      "invocation",
      "beforeEffect",
      "staleRequest",
      "attempt",
      "ack",
      "packetManifest",
      "packetFileAgent",
      "packetFileAuth",
      "exportManifest"
    ],
    "members": [
      {
        "evidenceId": "summary",
        "fileName": "summary.json",
        "exportFileName": "summary.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 5620,
        "sha256": "762c9066d4aff0940be89813d822b48a799aa567ed4543335f9848a2ad08eb37",
        "chunkCount": 1,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-packet-r1/export/summary.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "history",
        "fileName": "history.json",
        "exportFileName": "history.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 24944,
        "sha256": "e318a05ded2b2b889509e562fb5974dfe68f527ed6617117af13b10fc7fcb520",
        "chunkCount": 4,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-packet-r1/export/history.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "graph",
        "fileName": "graph.json",
        "exportFileName": "graph.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 42253,
        "sha256": "21152513e3f57afd9d2254af71323ef94069f802def750d33acfa2110af23532",
        "chunkCount": 6,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-packet-r1/export/graph.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "queries",
        "fileName": "queries.json",
        "exportFileName": "queries.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 66924,
        "sha256": "42ec8cbc561f202fffbab65e5cc2dc8dafad1c2502332e0d4db56095db80fc18",
        "chunkCount": 9,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-packet-r1/export/queries.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "terms",
        "fileName": "terms.json",
        "exportFileName": "terms.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 406,
        "sha256": "9fbb03ae64a07680157ab64948428f120ca166bb4a17065a588d1eb3649a613a",
        "chunkCount": 1,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-packet-r1/export/terms.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "reviewProgress",
        "fileName": "reviewProgress.json",
        "exportFileName": "review-progress.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 1915,
        "sha256": "6252cbad89e75c79f1d468ec73827a2fd5eacf6a80e4f890b68f31ab4b9e139e",
        "chunkCount": 1,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-packet-r1/export/review-progress.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "receipt",
        "fileName": "receipt.json",
        "exportFileName": "receipt.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 5360,
        "sha256": "4611a93eea7375b378f4b9cfe1e73a56e6f322c30ccb817af70aed47d12da8ad",
        "chunkCount": 1,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-packet-r1/export/receipt.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "receiptVerification",
        "fileName": "receiptVerification.json",
        "exportFileName": "receipt-verification.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 5895,
        "sha256": "5774ac485334c4d5ece38f12f5db217c455985d79e3f55486a2160b27bd4082c",
        "chunkCount": 1,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-packet-r1/export/receipt-verification.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "admission",
        "fileName": "admission.json",
        "exportFileName": "admission.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 17536,
        "sha256": "636b4a4f8bab35d9cee591a5ce33d25f0f0b8cc50c2a807c85e9a9e49d26fbc6",
        "chunkCount": 3,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-packet-r1/export/admission.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "invocation",
        "fileName": "invocation.json",
        "exportFileName": "invocation.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 1542,
        "sha256": "a36e52e9ef129c4d203dd3a6ffe2ceec4ebd12e383a16f00e67eb9c7282cb53c",
        "chunkCount": 1,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-packet-r1/export/invocation.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "beforeEffect",
        "fileName": "beforeEffect.json",
        "exportFileName": "before-effect.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 9008,
        "sha256": "b5d4628f7614a71b451fa3b53a977fb1a6f9beecdf1631318a76c8cd511e57bd",
        "chunkCount": 2,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-packet-r1/export/before-effect.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "staleRequest",
        "fileName": "staleRequest.json",
        "exportFileName": "stale-request.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 24299,
        "sha256": "4cafb8603eb0bdcad7f8eedd9869eac69ea03c91b697f7673e079a068ee65f15",
        "chunkCount": 3,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-packet-r1/export/stale-request.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "attempt",
        "fileName": "attempt.json",
        "exportFileName": "attempt.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 1595,
        "sha256": "86b5d2d35c519ee0119e361531ff190b9748a9ccaeb8e5c8c06326160286cdb2",
        "chunkCount": 1,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-packet-r1/export/attempt.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "ack",
        "fileName": "ack.json",
        "exportFileName": "ack.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 1484,
        "sha256": "cf3743f71916109cebea67bbea96469c86097e506c1410e2083a54d327f056db",
        "chunkCount": 1,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-packet-r1/export/ack.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "packetManifest",
        "fileName": "packetManifest.json",
        "exportFileName": "packet-manifest.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 1596,
        "sha256": "73d78fa73078484d143c9bb23c72ce3b555da521bdf805b57193058ce515380b",
        "chunkCount": 1,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-packet-r1/export/packet-manifest.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "packetFileAgent",
        "fileName": "packetFileAgent.log",
        "exportFileName": "packet-file-agent.log",
        "encoding": "UTF-8 original text bytes",
        "mediaType": "text/plain",
        "bytes": 221,
        "sha256": "6b6679fb6f97b8703bd57d86c1e2d743eed8551faf2abd802879f07269ac3ff2",
        "chunkCount": 1,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-packet-r1/export/packet-file-agent.log",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "packetFileAuth",
        "fileName": "packetFileAuth.log",
        "exportFileName": "packet-file-auth.log",
        "encoding": "UTF-8 original text bytes",
        "mediaType": "text/plain",
        "bytes": 225,
        "sha256": "c6ff6563925cc997195080ad6cf736a9d02e7fd791dc3f9d17daf45e2bcf8b4b",
        "chunkCount": 1,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-packet-r1/export/packet-file-auth.log",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "exportManifest",
        "fileName": "exportManifest.json",
        "exportFileName": "MANIFEST.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 3072,
        "sha256": "73de27029e09135c0704f95fd8be2dfa122e15050bf9278d1c0778423759bade",
        "chunkCount": 1,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-packet-r1/export/MANIFEST.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      }
    ]
  },
  "core02-simulated": {
    "profile": "core02-simulated",
    "caseId": "core02-simulated-r1",
    "catalogId": "core02-simulated-retained-2026-09-11-r1",
    "catalogSha256": "4fdae26b4ce457403a46bfa5c72ce43de00182a4e1317fce3258eba7fa3fd4dc",
    "sourceEdition": "continuity-core/0.2.0",
    "verifierId": "continuity-core/0.2",
    "coreVersion": "0.2",
    "packageVersion": "0.2.0",
    "domain": {
      "chainId": "31337",
      "deploymentId": "core-0.2-reference:core02-simulated-r1",
      "protocol": "continuity",
      "verifyingContract": "0x0000000000000000000000000000000000003002",
      "version": "0.2"
    },
    "head": {
      "canonicalTime": 25,
      "hash": "0x25f014bfe6d88681bd6f3d55d4f8dedf29b29d3bf6124aae96be7073fc489c09",
      "position": 25
    },
    "adapterProfile": {
      "descriptorHash": "0xa9f3354121fdbc4d983093e34684d5ddc841874f8fccadbafe30df65f2e16ac2",
      "profileId": "adapter:simulated",
      "profileVersion": "1"
    },
    "exportManifestSha256": "06ae5ca8a0c35eaab863d72e152ed2e159ed250c326697739e924cf620d4511f",
    "evidenceIds": [
      "summary",
      "history",
      "graph",
      "queries",
      "terms",
      "reviewProgress",
      "receipt",
      "receiptVerification",
      "admission",
      "invocation",
      "beforeEffect",
      "staleRequest",
      "exportManifest"
    ],
    "members": [
      {
        "evidenceId": "summary",
        "fileName": "summary.json",
        "exportFileName": "summary.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 3498,
        "sha256": "47b3d5d1b80526969d5aa507122b6287ab2152dc5f63d4661d717b16c55e2d9d",
        "chunkCount": 1,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-simulated-r1/export/summary.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "history",
        "fileName": "history.json",
        "exportFileName": "history.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 25503,
        "sha256": "70905bffb300dd4039511b821d6b74a1b96442981ca521ad0b47f1e6be8a33e3",
        "chunkCount": 4,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-simulated-r1/export/history.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "graph",
        "fileName": "graph.json",
        "exportFileName": "graph.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 43185,
        "sha256": "7df19e77b04277b128b8b7e883d818513ecfdc28738a8a4302b8d50ad88e943e",
        "chunkCount": 6,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-simulated-r1/export/graph.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "queries",
        "fileName": "queries.json",
        "exportFileName": "queries.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 67486,
        "sha256": "ca3afe45371d8d8024aa295a0dec50d479db06ee35273ca374b58187d0e0511d",
        "chunkCount": 9,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-simulated-r1/export/queries.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "terms",
        "fileName": "terms.json",
        "exportFileName": "terms.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 409,
        "sha256": "d2522b49677d03433e8a01300b10bf5e8d1248fe316592712870c3a732232883",
        "chunkCount": 1,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-simulated-r1/export/terms.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "reviewProgress",
        "fileName": "reviewProgress.json",
        "exportFileName": "review-progress.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 3,
        "sha256": "37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570",
        "chunkCount": 1,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-simulated-r1/export/review-progress.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "receipt",
        "fileName": "receipt.json",
        "exportFileName": "receipt.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 5411,
        "sha256": "2b63f4ae8828010862c7cc39da064620c47c15df36351b5e7adbfc7cfce52f5c",
        "chunkCount": 1,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-simulated-r1/export/receipt.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "receiptVerification",
        "fileName": "receiptVerification.json",
        "exportFileName": "receipt-verification.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 5962,
        "sha256": "79e361730ccbdfca170894beb62773a8cd8703a1ca73056c814e84086e5259e1",
        "chunkCount": 1,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-simulated-r1/export/receipt-verification.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "admission",
        "fileName": "admission.json",
        "exportFileName": "admission.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 18061,
        "sha256": "25ff21a2e29f16803f4e23311b94d9b28a1504c961c0c41cb690882c9ff221a5",
        "chunkCount": 3,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-simulated-r1/export/admission.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "invocation",
        "fileName": "invocation.json",
        "exportFileName": "invocation.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 1498,
        "sha256": "04621721df1ce6793d773a52837a60c1f1755152e532d512208a0f90b07804cb",
        "chunkCount": 1,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-simulated-r1/export/invocation.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "beforeEffect",
        "fileName": "beforeEffect.json",
        "exportFileName": "before-effect.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 9290,
        "sha256": "69f58014c06a1ec97645c6c16cf9cdc09020aec05e40b82a63f4d0d0e3d73025",
        "chunkCount": 2,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-simulated-r1/export/before-effect.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "staleRequest",
        "fileName": "staleRequest.json",
        "exportFileName": "stale-request.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 24852,
        "sha256": "4bf50efa2748fa098eec2a9f84f7d42a1c79e36f7a7dc1df8a4f443ee9f5affd",
        "chunkCount": 4,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-simulated-r1/export/stale-request.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      },
      {
        "evidenceId": "exportManifest",
        "fileName": "exportManifest.json",
        "exportFileName": "MANIFEST.json",
        "encoding": "UTF-8 original JSON; preserve source markers and scalar distinctions",
        "mediaType": "application/json",
        "bytes": 2321,
        "sha256": "06ae5ca8a0c35eaab863d72e152ed2e159ed250c326697739e924cf620d4511f",
        "chunkCount": 1,
        "sourcePath": "integrations/core-0.2-reference/cases/core02-simulated-r1/export/MANIFEST.json",
        "provenance": {
          "kind": "UNCHANGED_RETAINED_ARTIFACT",
          "origin": "Complete original accepted Core0.2 export; exact original manifest and source delivery identities preserved"
        }
      }
    ]
  }
});
export const COMMON_PROFILES = Object.freeze(["core02-packet", "core02-simulated"]);
export function commonCaseSpec(name) { if(typeof name !== "string" || !COMMON_PROFILES.includes(name)) throw new Error("UNSUPPORTED_COMMON_CORE_PROFILE"); return specs[name]; }
