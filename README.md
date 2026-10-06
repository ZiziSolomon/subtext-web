# Subtext (web)

The laptop half of **Subtext**: a calendar where routine *context* ("on call", "kids' weekend",
"school term") sits in the background as tinted stripes and a key, so the things you actually
have to show up for stand out.

The phone half is a fork of [Fossify Calendar](https://github.com/FossifyOrg/Calendar), on
branch [`feature/contextual-events`](https://github.com/ZiziSolomon/Calendar/tree/feature/contextual-events).

## Where your data lives

Nowhere new. This is a static site with no backend: it signs in to Google in your browser and
reads and writes your Google Calendar directly. Contextual rules are kept in a calendar of
their own in your Google account ("Subtext rules", one event per rule), which is how the phone
and laptop share them. Nothing about your calendar is stored in this repo or on the server
that hosts the page.

## Development

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # logic tests (Vitest)
npm run build
```

The rule logic (which events are contextual, lanes, the key, month bars) is ported from the
Android app. Both implementations run the same test cases, exported as JSON from the Kotlin
tests, so the laptop and phone can't drift apart.

## Licence

GPL-3.0-or-later, as for the Fossify code it ports logic from.
