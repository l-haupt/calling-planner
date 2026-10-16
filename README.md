# Calling Planner — Rev 12

A private, offline planning board for discussing ward calling changes in a
bishopric meeting. Current callings go in, people get dragged between roles,
and a summary of proposed releases and calls comes out.

Built for use on one laptop with a shared screen. **No ward data ever leaves
the browser it was entered in.**

---

## Running it

Double-click `calling-planner.html`, or drag it into any browser.

That's it. There is no build step, no install, no server, no account, and no
network call that carries your data anywhere.

- **Dependencies:** none bundled or installed.
- **Browsers:** any current Chrome, Edge, Firefox, or Safari.
- **Offline:** works fully offline. The only outbound request is to Google
  Fonts for the two typefaces (Public Sans, Spectral). If that request fails
  — no internet, or a blocked network — the page falls back to system fonts
  and everything else behaves identically. To cut the request entirely,
  delete the three `<link>` tags in `<head>`.

Serving it over HTTP works too, if you'd rather:

```
python3 -m http.server 8000      # then open http://localhost:8000/calling-planner.html
```

The only behavioral difference is that each origin (`file://` vs a given
host and port) gets its own separate saved board — see Storage below.

---

## File layout

```
calling-planner/
├── calling-planner.html    the entire application
└── README.md               this file
```

One file, roughly 82 KB, in three parts:

| Part | Where | What |
|---|---|---|
| Markup | `<body>` | Header bar, left panel (Members / Open / How to use), board region, modal and toast shells |
| Styles | one `<style>` in `<head>` | CSS custom properties on `:root`, with dark-mode overrides under both `prefers-color-scheme` and `[data-theme="dark"]` |
| Logic | one `<script>` before `</body>` | An IIFE holding all state and behavior. No framework, no modules, no build. |

Plain ES2020 — template literals, arrow functions, optional chaining. Nothing
that needs transpiling for a current browser.

---

## Storage

The whole board lives in `localStorage` under the key `callingPlanner.v1`,
as one JSON blob written on every change.

Consequences worth knowing before you collaborate:

- Data is **per browser, per origin, per machine**. Opening the same file on
  two laptops gives two independent boards. There is no sync.
- Clearing site data, or a private window, starts empty.
- **Save backup** writes a `.json` file; **Import → Backup file** reads one
  back. That file is how a board moves between people or machines, and it is
  the only thing that survives a cleared browser.
- Undo is in-memory only. It does not survive a reload.

A backup file contains real member names. Treat it as confidential.

---

## Data model

```jsonc
{
  "orgs":     [ { "id", "name", "collapsed" } ],
  "callings": [ {
      "id", "orgId",
      "group",     // "" or a band name, e.g. "Presidency"
      "title",
      "current",   // member id in place today, or null
      "proposed",  // member id in the draft, or null
      "cands": []  // member ids under consideration; non-empty means undecided
  } ],
  "members":  [ { "id", "name", "avail" } ],
  "hidden":   [ "orgId" ],              // organizations hidden from the board
  "groupColors": { "<orgId>::<group>": 0 }  // palette index 0-6, optional
}
```

A calling is in exactly one of three states:

| State | Condition | Shown as |
|---|---|---|
| Filled | `proposed` set | Name chip, green when it differs from `current` |
| Deciding | no `proposed`, `cands` non-empty | Amber band, "Considering N" |
| Open | no `proposed`, no `cands` | Red dashed "Open" pill |

`norm()` migrates older saved states and backup files forward by filling in
missing fields, so files written by earlier revisions still load.

---

## Code map

Everything is in the one `<script>`. Useful entry points:

| Area | Functions |
|---|---|
| State | `load` `save` `norm` `blank` `commit` `undo` |
| Moves | `place` `release` `revert` `addCand` `chooseCand` `dropCand` |
| Render | `render` → `renderChips` `renderBench` `renderOpen` `renderBoard` `renderSel`; `slotHTML` and `slotsHTML` draw a calling and its group bands |
| Import | `parseCallings` (dispatcher), `parseLabeled` + `recParts` + `splitRecords` (LCR List view), `inferOrg` `inferGroup` `labelOrg` (classification) |
| Export | `exportData` `summaryText` `showSummary` |
| Dialogs | `openModal` `askText` `askConfirm` `askChoice` |

`commit(fn, msg)` is the single mutation path: it snapshots state for undo,
applies `fn`, saves, re-renders, and toasts. Anything that changes data should
go through it. Rendering is full-redraw from state — there is no diffing, and
no DOM is treated as a source of truth.

Events are delegated from `document` and dispatched on `data-act` attributes,
so new buttons need no wiring beyond a `case` in the click handler's `switch`.

---

## Import formats

`parseCallings` auto-detects the shape of pasted text. In order of preference:

1. **LCR List view** (best). Each record is: section label, calling title, an
   optional `Custom Calling` marker, name, sustained date. The section label
   repeats on every record. This is the only format that carries enough
   information to build both organizations and the color-banded groups
   automatically. Records are anchored on the date line, not on blank lines.
2. **Stacked** — calling, name, date on their own lines, with headings
   optionally above a run of callings.
3. **Tab- or pipe-separated rows** — `Organization | Calling | Name`, or
   `Calling | Name`.

`Calling Vacant` becomes an open position. Column labels (`Sustained`, `Name`,
`Position`…) are skipped. When a paste has no section labels, organization and
group are inferred from the calling titles by `inferOrg` and `inferGroup` —
two ordered lists of regexes that are the first place to look if something
lands in the wrong column.

---

## Modifying it

Open the file in any editor and reload the browser. There is nothing to
rebuild, and no state to reset between edits — your board is in localStorage,
not in the file.

A few conventions worth keeping if you extend it:

- Bump `REV` and `REV_DATE` at the top of the script, and add a line to the
  changelog list in the revision popover markup. The revision number shows in
  the header, in backup filenames, and on copied summaries, which is how you
  tell which build someone is running.
- Route every data change through `commit()` so undo and autosave keep working.
- Colors come from the CSS custom properties on `:root`. Add new ones there
  and in both dark-mode blocks rather than hard-coding hex values.
- Icons are inline SVG in the `ICO` object. Unicode glyphs were tried and
  rendered inconsistently across platforms.
- Anything stored per calling needs a default in `norm()` so older backups
  keep loading.

### One Claude-specific hook

`exportData` opportunistically calls `window.claude.use('downloads')` to offer
a native save dialog when the page is running as a Claude artifact. Outside
that environment the call is wrapped in a `try` and resolves to nothing, and
the function falls back to showing the JSON in a copyable textarea. Nothing
else in the app touches that API, and the fallback path is fully functional —
you can delete the `downloads` block if you'd rather not carry it.

---

## Privacy notes

Worth repeating to anyone you hand this to:

- Calling deliberations are confidential. The tool is local-only by design.
- **Hide names** (or pressing `H`) blurs every name on screen instantly, for
  when someone walks past the laptop.
- **Import → Clear everything** wipes the board from the browser.
- Backup `.json` files contain names in plain text. Store them accordingly,
  and delete them when the planning is done.
