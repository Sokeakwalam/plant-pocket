# Plant Pocket

A plant-care journal for iPhone and Android, hosted on GitHub Pages, with optional private phone syncing through Firebase's no-cost Spark plan.

## What it includes

- Your 16 original plants and photos, researched care sources and uncertainty labels.
- Compost-based watering checks, seasonal estimates, notes, care history and undo.
- New plants, local photo resizing, web-search links and care-file import.
- Full photo-inclusive JSON backups and safe dated-record import.
- An initial owner-confirmed watering on 11 November 2026, applied once without replacing later records.
- Offline use after the app says Ready offline.
- Optional private syncing between linked phones, without an email, password or Google login.

## Link your phones

1. Complete the administrator setup at firebase-setup.html.
2. Open the installed app online on the first phone and scroll to Keep your phones in sync.
3. Tap Start shared collection, then Invite phone.
4. Open the app on the other phone, tap Join with a code, and paste the invitation.

Firebase creates anonymous device identities in the background. Invitations expire after 12 hours and can be claimed once. The phone that created the collection can issue invitations. Uninvited devices cannot read or write the collection. There is no public database or account sign-in screen.

Changes sync while the app is open online. Offline changes are saved in the app's IndexedDB journal and upload after reconnecting. The other phone receives updates while it is open online. This is not background push or guaranteed closed-app syncing.

Both phones' watering/check records are combined. Different field edits combine independently. When the same field is edited concurrently, the later recorded change wins deterministically. Undo and plant removal propagate, with tombstones preventing stale offline data from restoring deleted records. Historical operation versions are retained in the private journal.

## Keep it free

Keep Firebase on Spark and do not attach billing or upgrade to Blaze. This implementation uses Anonymous Authentication and Realtime Database only, not Cloud Functions, Cloud Storage, paid AI, or a paid server. Realtime Database's Spark quotas apply; sync can pause at a quota limit while local records remain available.

Official billing guidance: https://firebase.google.com/docs/database/usage/billing

The app itself remains on free GitHub Pages. There is no subscription, custom domain requirement or external plant-identification API.

## Administrator setup

- Enable Security → Authentication → Sign-in method → Anonymous.
- Create Realtime Database in locked mode.
- Publish firebase/database.rules.json in its Rules tab.
- Register one Firebase Web app and put its public configuration, including databaseURL, in dist/firebase-config.js.
- Run python3 scripts/package-release.py before publishing.

The checked-in Firebase configuration is public web-app metadata, not an administrator credential. Never add service-account keys, passwords or tokens to this repository. Database rules provide access control.

The user approved publishing the 16 bundled photos, initial care/radiator notes and the initial watering date. Later photos, notes and history remain on linked devices and in the private Firebase collection; they are not committed to GitHub.

## Installation and recovery

iPhone: open the app in Safari → Share → Add to Home Screen.
Android: open in Chrome → menu → Install app / Install and create shortcut.
Open the installed app online and wait for Ready offline.

Use the installed app consistently: separate browsers and installations can have separate storage. Save a full backup occasionally. Clearing website data can remove both the collection cache and its anonymous identity. A lost secondary device needs a new invitation from the owner phone. If the owner phone's identity is lost, the Firebase project administrator must recover/manage access in the console.

update.html refreshes the offline app safely. record-watering.html repairs the initial watering record even in an older cached app, without erasing notes or later dates.

## Development and checks

No package install is needed to serve or use the static app:

    python3 -m http.server 8087 --bind 127.0.0.1 --directory dist

Prepare the release assets:

    python3 scripts/package-release.py

Core checks:

    swift tests/run.swift .
    node tests/sync-core.test.cjs

Firebase's CLI, SDK and Playwright Core are development-only tools under ignored .build/firebase-tools. With them installed, start a demo emulator:

    node .build/firebase-tools/node_modules/firebase-tools/lib/bin/firebase.js emulators:start --only auth,database --project demo-plant-pocket

The current CLI needs Java 21 or later. No live Firebase project or billing is used for these tests.

    node tests/firebase.test.cjs
    node tests/two-phone.test.cjs

The browser test uses the Chrome already installed on this Mac and two isolated contexts. A localhost-only test configuration points them at the demo emulators. It does not expose any production authentication bypass.

tests/browser.swift checks the responsive app and ordinary plant workflows. tests/upgrade-server.py with tests/upgrade.swift reproduces upgrading from the original offline app.

## Publishing

.github/workflows/pages.yml deploys dist/ after pushing main. Only static app files and the public Firebase web configuration are deployed. .private/ holds personal transfer files and is excluded, as are .build/, debug logs and ZIPs.

When releasing changes, update the cache version and release asset path, then run scripts/package-release.py. Versioned asset URLs allow older offline app shells to fetch the current app code without mixing cached releases.

## Security update — 14 November 2026

Release v6 uses server-validated structured sync operations. Existing JSON operations remain readable, and invalid historical operations are skipped so that one corrupt entry cannot block reconnecting. Old app versions must be refreshed before writing with the new rules. Existing care records and anonymous identities are retained.

The collection owner can use **Manage linked phones → Remove access** to revoke a device. **Disconnect** also revokes the current device's membership and requires an online connection. Revocation prevents future database access but cannot erase previously downloaded records. Revoked identities cannot restore their membership; clear the old browser identity and use a fresh invitation if intentionally pairing that device again. Disconnecting the owner also prevents that identity from issuing further invitations; export a backup first if replacing the owner phone.

Every shipped HTML page has a Content Security Policy. Utility pages allow their existing inline scripts/styles using exact SHA-256 hashes; the main app permits no inline scripts. The policy permits only the pinned Firebase SDK host and required Firebase/Auth connections. Database syncing uses WebSockets so the security policy can block JSONP script transports; a network that blocks WebSockets must be changed before cloud syncing can resume. Deployment actions are pinned to immutable commits. The public Firebase browser key is intentionally retained; it is not an administrator credential.

The Firebase rules must be deployed together with v6. Keep the Firebase project on Spark without attaching billing. The regression suite tests invalid operation rejection, member/owner permissions, revocation, immutable records, corrupt legacy-record recovery, two-phone offline convergence, and inline-script blocking. Browser tests extend CSP only for local emulator endpoints; these endpoints are absent from published pages.

## Manual watering dates

Open a plant and choose **Record another watering date**. Select today or a past date, then **Save watering**. The entry is added to the normal history and shared with linked phones. Backdated watering never replaces a newer last-watered date or soil check; duplicate watering entries for the same plant and date are prevented. The quick watering button still records today.
