# License and asset review — 2 November 2026

The MIT license covers this project's own code. External packages retain their own licenses; the project license does not replace their terms. Dependencies are downloaded by npm/Maven or the pinned runtime setup, rather than vendored into this source repository. Preserve their accompanying notices when redistributing a built bundle or runtime.

Direct frontend packages: React/React DOM (MIT), lucide-react icons (ISC), Vite (MIT), Tailwind CSS (MIT), PostCSS (MIT), Autoprefixer (MIT), Prettier (MIT), Playwright (Apache-2.0). Installed npm package metadata is inventoried in `docs/npm-licenses.json`; the lockfile pins the exact dependency graph. This inventory describes metadata, not an independent legal opinion.

The Java application directly uses Spring Boot/Framework/Kafka, Flyway, Micrometer and associated Apache-licensed libraries; PostgreSQL JDBC uses BSD-2-Clause. The resolved Maven dependency graph and OSV report are generated during CI. Transitive packages and their upstream POM/license notices also apply. Downloaded OpenJDK, Maven, PostgreSQL, Kafka and Node distributions retain their upstream license files in the extracted runtime folders. They are not included in Git.

Assets in `docs/demo` are recordings/screenshots of this project's local demo using fictional funds, captured on 2 November 2026. They contain no customer data, API credentials or third-party bank logos. Icons come from lucide-react. There are no stock photos, external templates or copied bank brand assets in the current desk.

`src/LegacySimulator.jsx` is the original browser prototype retained as an explicitly labeled archive; it is not evidence of deployed Java/PostgreSQL behavior. Bank names in that archive are illustrative references without affiliation. Original PDFs/conversation and resume materials remain outside version control and are not published. No claim of exhaustive third-party provenance certification is made.

The retained simulator has a targeted publication security correction: Web Crypto replaces weak randomness for identifiers. Its visual layout and simulated workflow remain unchanged; original reference files stay private.
