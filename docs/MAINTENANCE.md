# Maintaining the public edition

Use a branch and pull request for reviewable contributions. Keep changes scoped and document validation. Do not commit credentials, personal files, live incident data, dependency installations or generated cases.

After changing tracked distribution content, refresh its integrity index from the repository root:

```sh
python3 tools/update-package-index.py
node tools/verify-package.mjs
```

The index records the current source tree; it is not a signature or proof of safety. Include its update in the same commit as the change. Validate changed behavior before submitting a pull request. Preserve historical release archives and checksums; use a new release artifact for changes.

The main branch is public. Authorized maintainer commits are synchronized from a dedicated public staging checkout. Only clean, committed, fast-forward history is eligible; uncommitted files and divergent histories are held for review. Changes to website files deploy GitHub Pages automatically. Pull requests do not deploy the site.

The separately linked Sites edition may evolve independently and is currently owner-private. Public users can use GitHub Pages and the local tutorial without access to that edition.
