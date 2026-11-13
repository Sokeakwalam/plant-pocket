# Plant Pocket

An offline home-screen plant journal for iPhone and Android. No package installation, API keys, paid APIs, accounts in the app, backend, analytics, third-party scripts or subscription.

## Included

- All 16 photographed plants, care sources and uncertainty labels.
- Seasonal watering estimates and compost-based checks.
- Separate “watered” and “still moist” check-ins, with undo and history.
- Add/edit/remove plants, local photo resizing and notes.
- Web search links (opens the browser; no automatic scraping or identification).
- Versioned JSON care-file import with preview and validated input.
- Full photo-inclusive backup export and explicit-confirmation restore.
- Downloadable recurring calendar soil checks; the calendar controls alerts.
- Offline service worker and installable manifest, including GitHub project subpaths.

Your radiator clarification is preserved: the radiators run infrequently, remain mildly warm and plants have remained healthy after about three months. There is no categorical relocation warning.

## Use on phones

The app needs an HTTPS web address for installation and the initial offline download. It then works without internet, except when you choose web search or a source link.

iPhone: open the published address in Safari → Share → Add to Home Screen.
Android: open in Chrome → menu → Install app / Add to Home screen.
Open the installed app once online and wait for “Ready offline”.

Devices keep independent collections. Export a full backup and import it on the other phone to transfer data. Clearing website data can remove the collection. Keep backups.

## Free GitHub Pages publishing

GitHub Pages currently supports public repositories on GitHub Free:
https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages

1. Create a public repository named plant-pocket using your GitHub account.
2. Upload this project's source, including dist/ and .github/workflows/pages.yml, or push it on the main branch.
3. Open repository Settings → Pages → Source → GitHub Actions.
4. Run “Publish Plant Pocket” in the Actions tab, or push an update.
5. Open the URL shown by the successful deployment.

Only dist/ is deployed. It contains the initial 16 photos and seed care profiles. A public repository and Pages site make those bundled photos, profiles and radiator notes publicly readable. User-added photos, notes, and logs remain on each device unless exported/shared. Review the bundled content before publishing. No paid account, custom domain or paid Actions runner is needed for this public static project within GitHub's free limits.

Do not put backup files, passwords, tokens or browser storage into the repository.
No GitHub login is required to USE the published plant app.

## Preview on this Mac

Run from this directory:

    python3 -m http.server 8080 --directory dist

Then open http://localhost:8080 in a browser on this Mac.
A phone visiting an ordinary HTTP LAN address cannot install full offline functionality; use HTTPS hosting for the phone.

## Adding researched care

Use the app's search button, summarize guidance and keep the source URL. Or ask your assistant to research the new plant using RESEARCH-PROMPT.md and create a care JSON file, then use “Import care / backup”. The template is care-file-template.json. This is manual research/import, not AI embedded in the app, and has no application API fees. Using an assistant separately remains subject to that service's own access terms.

Care file format: format=plant-pocket-care, version=1, plants=array. Each plant requires name, light, water, summer and winter ranges (e.g. 7–14), and integer checkDays (1–90). Optional botanical, care, source (HTTPS), group (Foliage/Succulent/Orchid), confidence and notes.
Care imports ADD plants without overwriting existing logs. Full backups RESTORE a collection only after explicit confirmation.

## Care and engineering limits

Photo IDs are inferred from the supplied images, not definitive botanical diagnoses. Day ranges are practical estimates for an Irish home. Compost dryness overrides dates. No last-watered dates have been invented.

Reminders appear in the app; there are no background push notifications. Calendar export creates recurring checks and does not stay synchronised with later changes. Edit/remove those events in your calendar if the plant's rhythm changes. There is no automatic cross-device sync.

The web app uses browser capabilities such as IndexedDB, Canvas, Fetch (local files only) and service workers. “No APIs” means no external service APIs or API keys, not an absence of browser programming interfaces. Outbound search/source links run only when clicked. Static hosting still receives normal web asset requests.

## Checks

On macOS with Xcode command line tools:

    swift tests/run.swift .

This evaluates JavaScript syntax and core tests in Apple's JavaScriptCore, validates seeds/import round trips, dates, seasons, schedules, import rejection and calendar export. Browser interaction and installation should additionally be checked on actual iPhone and Android devices. No Node dependencies are needed.

## Updating the app

Bump the service-worker cache version in dist/sw.js AND dist/app.js together when changing static assets. This ensures a new install fetches changed files. Keep the existing IndexedDB schema/data intact.

## Dated care records

Import a version-1 plant-pocket-records file with a records array. Each record has plantId, type (watered or moist), date (YYYY-MM-DD, no future dates), and optional id. Preview lists affected plants; import merges history without replacing notes or plants. Same-day duplicate records are skipped. Later soil checks are preserved. Unknown plant IDs are skipped. Personal record files belong in .private/, which is excluded from Git and deployment. After an app update, reopen the app online to download the new offline cache, then close and reopen if the previous interface is still shown.

## Automatic initial watering record

At the owner’s request, the published app now includes an initial watering record dated 11 November 2026 for the 16 original plants. This date is public with the app source. A one-time device migration adds missing records without overwriting notes, later checks or watering logs, or restoring deleted plants. The migration marker is preserved in full backups. Open update.html online to load the latest offline cache without clearing device storage.
