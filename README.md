# Packing Log

A mobile-first pack job counter for a skydive rigger. Tap `+`/`−` to log each
pack job as you finish it, see today's total earnings at a glance, and every
tap is saved straight away — no "end of day" step required.

## Categories & rates

| Category   | Rate      |
| ---------- | --------- |
| Tandem     | £11.00    |
| Instructor | £6.50     |
| Student    | £6.50     |
| Sport      | £6.50     |

## Running it

```bash
npm install
npm run dev
```

This starts a server on your machine and prints two URLs: a `localhost` one
for the same computer, and a `Network` one (something like
`http://192.168.x.x:4321`). Open the **Network** URL on your phone (same
wifi) to use it from the packing floor.

For something you leave running day to day rather than restarting each
morning, build once and run the standalone server:

```bash
npm run build
npm run start
```

(`npm run start` runs `node ./dist/server/entry.mjs`, listening on the same
network address.)

## How the data is stored

- `data/state.json` — today's running counts. Not meant to be edited by hand.
- `data/packing-log.csv` — one row per day, automatically kept up to date:

  ```csv
  date,tandem,instructor,student,sport,total_packs,total_earnings
  2026-08-22,6,2,1,0,9,84.00
  ```

Every button tap immediately updates (or inserts) today's row in the CSV —
you don't need to do anything at the end of the day. When the app is opened
on a new date, it notices the date has changed, makes sure the previous
day's row is saved, and starts today at zero.

Both files live in the `data/` folder next to the project and are excluded
from git (see `.gitignore`), since they're your personal work records, not
source code. Back them up or open the CSV in a spreadsheet whenever you like
— nothing else touches that file while the server isn't running.

## Tech

Built with [Astro](https://astro.build) in server mode (`@astrojs/node`) so
button taps can write straight to the local CSV file. No database, no
external services — everything stays on the machine you run it on.
