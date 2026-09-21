# Website and release maintenance

The static website/ directory retains the accepted Understand-first presentation, black-on-white graffiti, green Continuity/RAmEx Labs branding, optional local-or-chain explanation and recorded case comparison. The primary download now points to the complete evaluation.2 archive and its separate Release checksum asset. Original evaluation.1 archive bytes and the historical website/source snapshot remain preserved; current tools live in the complete maintenance package.

## Preview and hosting

From the repository root, run `python3 -m http.server 8000 --bind 127.0.0.1` and open `http://127.0.0.1:8000/website/`. Stop with Ctrl-C. Use this only with trusted local files. GitHub Pages deploys website/ exclusively.

The public site is https://continuity.ramex.com/ with HTTPS. Preserve website/CNAME, the github-pages environment and the accepted Pages workflow. Main-branch website changes deploy through GitHub Actions; pull requests do not deploy. The site has no backend, forms, analytics, remote fonts or runtime credentials. Check actual Actions and live bytes after publication.

Release assets contain the complete current source archive and a separate checksum. Do not embed that archive's own hash inside itself. Preserve historical assets instead of replacing bytes behind an old release name. The newer developer-guide link points to current repository documentation; historical local guide/source files retain their original scope.

## Separate evolving presentation

The Sites edition at https://continuity-core-demo.zero-hour-zulu.chatgpt.site/ remains owner-private and evolves independently. It is not synchronized by a Pages release. No Sites sharing change is part of this edition.

## Asset provenance

The graffiti is an original AI-generated headline guided by the founder's stylistic reference. The stock alphabet reference and watermark are not distributed. The statement banner is authored SVG. Existing font/license files are retained. Source identities and historical presentation records remain in PRESENTATION-PROVENANCE.json; no visual asset or stylesheet changes in this release.
