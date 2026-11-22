# Calling Planner — Rev 18

A private, offline planning board for discussing ward calling changes in a
bishopric meeting. Current callings go in, people get dragged between roles,
and a summary of proposed releases and calls comes out.

Built for use on one laptop with a shared screen. **No ward data ever leaves
the browser it was entered in.**

---

## Running it

Double-click `calling-planner.html`, or drag it into any browser.

There is no build step, no install, no server, no account, and no network call
that carries your data anywhere.

- **Dependencies:** none bundled or installed.
- **Browsers:** any current Chrome, Edge, Firefox, or Safari.
- **Offline:** works fully offline. The only outbound request is to Google
  Fonts for the two typefaces (Public Sans, Spectral). If that fails the page
  falls back to system fonts and behaves identically. To cut the request
  entirely, delete the three `<link>` tags in `<head>`.

Serving it over HTTP works too:

```
python3 -m http.server 8000      # http://localhost:8000/calling-planner.html
```

Each origin (`file://` vs a given host and port) gets its own saved board —
see Storage.

### Publishing it with GitHub Pages

Because it is one static file, Settings → Pages → deploy from branch gives a
URL anyone can open, with nothing to build. The page carries no ward data, so
a public URL exposes the tool and not a single name.

---

## File layout

```
calling-planner/
├── calling-planner.html              the entire application (~100 KB)
├── tests/reliability.test.cjs        regression checks, plain Node, no deps
├── .github/workflows/reliability.yml runs them on every push and PR
├── .gitignore                        keeps board backups and rosters out of git
└── README.md                         this file
```

Run the checks locally with `node tests/reliability.test.cjs` from the repo
root. They need no install: the suite reads the HTML, lifts the pure functions
out of it, and exercises them in a bare VM. They assert on behaviour rather
than on source text, so rewording a message does not break the build.

Three parts, one file:

| Part | Where | What |
|---|---|---|
| Markup | `<body>` | Header bar, left panel (Members / Open / How to use), board, modal and toast shells |
| Styles | one `<style>` in `<head>` | CSS custom properties on `:root`, dark mode under both `prefers-color-scheme` and `[data-theme="dark"]` |
| Logic | one `<script>` before `</body>` | An IIFE holding all state and behavior. No framework, no modules, no build. |

Plain ES2020. Nothing that needs transpiling for a current browser.

---

## Storage

The whole board lives in `localStorage` under `callingPlanner.v1`, written on
every change.

- Data is **per browser, per origin, per machine**. Two laptops means two
  independent boards. There is no sync.
- **Save backup** writes a `.json`; **Import → Backup file** reads one back.
  That file is how a board moves between people, and the only thing that
  survives cleared site data.
- Undo is in-memory and does not survive a reload.
- If the browser ever refuses to store the board, a red **Not saving** button
  appears in the top bar and the page warns before you close the tab. Saving
  failures are never silent.

A backup file contains real member names. Treat it as confidential.

---

## Data model

```jsonc
{
  "orgs":     [ { "id", "name", "collapsed", "wide?" } ],
  "callings": [ {
      "id", "orgId",
      "group",     // "" or a band name, e.g. "Presidency"
      "title",
      "since",     // sustained date as imported, e.g. "16 Jul 2023"
      "current",   // member id in place today, or null
      "proposed",  // member id in the draft, or null
      "cands": []  // member ids under consideration; non-empty means undecided
  } ],
  "members":  [ { "id", "name", "avail" } ],
  "hidden":   [ "orgId" ],
  "groupColors": { "<orgId>::<group>": 0 }   // palette index 0-6
}
```

A calling is in exactly one of three states:

| State | Condition | Shown as |
|---|---|---|
| Filled | `proposed` set | Name chip, green when it differs from `current` |
| Deciding | no `proposed`, `cands` non-empty | Amber band, "Considering N" |
| Open | no `proposed`, no `cands` | Red dashed "Open" pill |

`org.wide` is an optional explicit override of the automatic column width;
absent means decide by calling count.

`norm()` migrates older saved states and backups forward, so files written by
earlier revisions still load.

---

## Code map

| Area | Functions |
|---|---|
| State | `load` `save` `norm` `blank` `commit` `undo` `audit` |
| Moves | `place` `release` `revert` `addCand` `chooseCand` `dropCand` `completeOne` |
| Render | `render` → `renderChips` `renderBench` `renderOpen` `renderBoard` `renderSel`; `slotHTML` / `slotsHTML` draw a calling and its group bands; `isWide` decides column width |
| Import | `parseCallings` (dispatcher), `parseLabeled` + `recParts` + `splitRecords` (LCR List view), `inferOrg` `inferGroup` `labelOrg` (classification), `parseDate` `tenureText` |
| Export | `exportData` `summaryText` `summaryLines` `showSummary` |
| Dialogs | `openModal` `askText` `askConfirm` `askChoice` `showCheck` `showAsk` |

`commit(fn, msg)` is the single mutation path: snapshot for undo, apply, save,
re-render, toast. Every data change should go through it. Rendering is a full
redraw from state — no diffing, and no DOM is a source of truth.

Events are delegated from `document` and dispatched on `data-act`, so a new
button needs only a `case` in the click handler's `switch`.

---

## Import formats

`parseCallings` auto-detects the shape of pasted text:

1. **LCR List view** (best). Each record is: section label, calling title, an
   optional `Custom Calling` marker, name, sustained date — with the section
   label repeated on every record. The only format carrying enough to build
   organizations, color-banded groups, and time in calling automatically.
   Records are anchored on the date line, not on blank lines.
2. **Stacked** — calling, name, date on their own lines, headings optional.
3. **Tab- or pipe-separated rows** — `Organization | Calling | Name`.

`Calling Vacant` becomes an open position; column labels are skipped. Without
section labels, organization and group are inferred from calling titles by
`inferOrg` and `inferGroup` — two ordered lists of regexes, and the first place
to look when something lands in the wrong column.

---

## Modifying it

Open the file in any editor and reload the browser. Nothing to rebuild, and no
state to reset between edits — the board is in localStorage, not in the file.

Conventions worth keeping:

- Bump `REV` and `REV_DATE` at the top of the script and add a line to the
  changelog in the revision popover markup. The revision shows in the header,
  in backup filenames, on copied summaries, and on feature requests, which is
  how you tell which build someone is running.
- Route every data change through `commit()`.
- Colors are CSS custom properties on `:root`. Add new ones there and in both
  dark-mode blocks rather than hard-coding hex values.
- Icons are inline SVG in the `ICO` object. Unicode glyphs were tried and
  rendered inconsistently across platforms.
- Anything stored per calling needs a default in `norm()` so older backups
  keep loading.

### One Claude-specific hook

`exportData` opportunistically calls `window.claude.use('downloads')` for a
native save dialog when the page runs as a Claude artifact. Elsewhere the call
is wrapped in a `try`, resolves to nothing, and the function falls back to a
copyable textarea. Nothing else touches that API; the `downloads` block can be
deleted without consequence.

---

## Feature requests

The **Request a feature** button (top of the revision history, and in the How
to use tab) composes a request — what was asked for, the revision, and board
counts, never member names — and copies it to the clipboard. The page sends
nothing on its own.

**Open an issue on GitHub** sends it straight to this repo's issue tracker
with the title and body prefilled; the requester presses Submit there, and
needs a GitHub account. **Copy instead** produces the same text for anyone
without one. The target repo is the `REPO` constant at the top of the request
code — change it if you fork this.

The revision stamp on every request tells you whether something is already
fixed in a newer build.

---

## What changed since Rev 12

| Rev | Change |
|---|---|
| 18 | Backups download as a real file; removing a member clears them from shortlists; regression suite and CI |
| 17 | Feature requests open a prefilled GitHub issue |
| 16 | Request a feature button |
| 15 | Tick off callings one at a time as they are extended; organizations widen at 14 callings |
| 14 | Long organizations span the board; one button collapses or expands them all |
| 13 | Time in calling from sustained dates; All toggles every organization; a data check that repairs and reports problems |
| 12 | Member search, one-click fill from an open position, Open only view, weighing several names per calling |

Rev 13 is worth singling out: `save()` had been swallowing every error, so a
browser refusing to store the board would have lost a whole meeting's work
silently. It now surfaces that, repairs damaged saved state on load rather
than trusting it, and preserves unreadable data instead of overwriting it.

---

## Privacy notes

- Calling deliberations are confidential. The tool is local-only by design.
- **Hide names** (or `H`) blurs every name on screen instantly.
- **Import → Clear everything** wipes the board from the browser.
- Backup `.json` files contain names in plain text. Store them accordingly and
  delete them when the planning is done.
- Keep member names out of anything committed to this repo, including issues
  and sample data.
