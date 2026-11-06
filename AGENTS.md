<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Connecting book sources

Scope is the 60 names in `lib/reader/requested-sources.ts`. Do not add anything else, and do not bring back SF, Wikisource, Sites or Cloudflare tooling. The app runs locally on Next.js; do not deploy it.

## Where to work

- Branch from `main` into a `feature/` branch. Do not commit to `main` directly, and merge into it only when the user asks.
- Normally change only `lib/reader/sources/registry.ts` and `SOURCE-VALIDATION.md`.
- Connecting a source should not need changes to the data layer or the UI (`lib/reader/types.ts`, `lib/reader/reading.ts`, `lib/reader/storage.ts`, `app/`, `components/`). If it seems to, ask the user first.
- If a site needs a new rule option, keep it additive and optional, and add a test in `tests/source-service.test.mjs`. Do not change how existing options behave.

## Rules

- Never bypass a block. If a site answers with a Cloudflare challenge, a 403 or a login wall, record it as unavailable and move on. No browser User-Agent spoofing, no challenge solving, no cookies copied from a browser.
- Do not change the request headers in `lib/reader/sources/http.ts`.
- Do not run or copy JavaScript from Legado or other third-party source lists. They are hints for finding addresses and page structure only.
- Do not add dependencies.
- Send one request at a time per site, and do not hammer a site to debug it. Save a page and work from the saved copy.
- Do not paste novel text into commits, tests or fixtures. Use short made-up text.

## How to judge a source

Only `npm run test:sources` counts. It uses the same service as the app, so a one-off probe proves nothing: earlier records marked sites as blocked only because a probe sent no User-Agent.

A source is connected only when search, catalog and chapter all pass. Then also check these, because they fail silently:

- **It is the right site.** Compare the site's name with the requested one. A similar name is not enough, so mark doubtful ones for the user to confirm.
- **The catalog is complete and in reading order.** Compare the chapter count with what the site says. If the page lays chapters out in columns, use `sortByKey`. If the page lists only part of the catalog, find the full one with `chapters.url`.
- **The chapter is whole.** Look for "1/2" in the title or a next-page link, and use `pagePattern`, which must capture the page number. Read a chapter from the middle of a book, not only the first.
- **The text is clean.** Look at the first and last lines for site notices and add them to `clean`. Do not remove the author's own notes.
- **Traditional and simplified both find books.** Try both spellings, and set `queryScript` and `queryEncoding` when needed.
- **Author and title are real values.** Test a book whose title you know, and strip extras such as `(1-321)` from titles, because books are matched across sources by title and author.

`SOURCE-VALIDATION.md` lists the current state of each source. Move a source between its tables when you learn something, with the reason. Sites without a search function cannot be used, since the app finds books by title.

Run `npm run typecheck` and `npm test` before each commit. Use one commit per site or small group, and say in the message which sources changed.
