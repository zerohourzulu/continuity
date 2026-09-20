# Website and publication

The static `website/` directory contains the accepted presentation: default Understand view, original black-on-white graffiti, green wordmarks, optional chain explanation, recorded case comparison, developer path, evidence and licensing-corrected evaluation R2 download. Paths are relative for hosting under `/continuity/`. No build, backend, forms, analytics, remote fonts or runtime credentials are needed.

For a local preview, from the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/website/`. Stop with Ctrl-C. Only use this root preview on trusted local files; Pages uploads `website/` exclusively.

## GitHub Pages maintenance

Intended repository: https://github.com/zerohourzulu/continuity

Intended public site: https://zerohourzulu.github.io/continuity/

Push only the approved staged commit under the adopted Apache 2.0 terms. Select GitHub Actions as the repository’s Pages source, retain the github-pages environment restricted to the default branch, and manually run **Publish Continuity demo** on that branch. The workflow deploys on main-branch pushes affecting website files or the workflow itself, and can also be launched manually; pull requests do not deploy. Official actions are pinned to exact commits, checkout credentials are not persisted, and only the deployment job receives Pages/OIDC write permissions. No project secrets are required. Only the website directory is deployed. See GitHub Actions for the deployment result.

Set the repository About website to the Pages address after successful deployment. The README banner links there. Confirm the resulting URL, default view, navigation, downloads and tutorial checksum after publication.

## Separate evolving presentation

Sites: https://continuity-core-demo.zero-hour-zulu.chatgpt.site/

This edition is currently owner-private, and its sharing remains unchanged. It can evolve independently using Sites; edits do not automatically update this Git snapshot. Keep the README’s access label accurate if access changes. To adopt a Sites revision here, copy only approved static presentation assets, review the differences and create a new version; do not copy hosting credentials, local metadata or private development trees.

## Assets and records

The graffiti is an original AI-generated headline guided by the founder’s stylistic reference. The stock alphabet reference and its watermark are not distributed. The green statement banner is authored SVG. A previously bundled Permanent Marker font and its Apache license remain included, though the headline now uses the generated image. Evidence and runtime sources preserve their prior identities; evaluation R2 has a new archive/checksum for the licensing correction. Standalone website Markdown links resolve into the complete licensing-corrected evaluation snapshot under `website/source/`. No Core runtime change is introduced.
