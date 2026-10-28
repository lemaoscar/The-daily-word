# Daily Word

A private, local-first Bible reading and study app. Open index.html to explore, or run the local app server to install it and use its offline-friendly experience.

## Included spaces

- **Everyday planning:** your live local clock, current-day reading, reflection prompt, month-by-month reading calendar, progress, reading streak, and one-tap completion.
- **Daily reminders:** schedule a reminder while the Prayer page is open or download a recurring calendar event for Apple Calendar, Google Calendar, Outlook, or another calendar app.
- **Installable offline app:** install Daily Word from a supported browser. The World English Bible and app shell are cached during installation; the King James Version and pages you visit are saved for offline use as you open them.
- **Reader preferences:** use light, dark, or device appearance; adjust Bible text size; and choose a 12- or 24-hour clock.
- **Bible reader:** full offline World English Bible (WEB), refreshed from eBible.org with official corrections through 22 October 2026, and King James Version (KJV), chapter navigation, full-text search, verse highlighting and annotations, saved passages, full-screen reading, device-voice read-aloud, chapter/verse sharing, and text downloads.
- **Encrypted personal backups:** make a password-protected backup of notes, prayer entries, marks, saved passages, progress, quiz scores, storyboards, and preferences; restore it on another device without overwriting existing notes. Passphrases are never sent to a server. You can erase Daily Word data from the current browser.
- **Daily study:** a day-by-day path with linked related readings, reflection questions, local notes, a focus timer, completion tracking, and a closing prayer.
- **Year plan:** 365 dated entries that distribute the 1,189 Bible chapters across the year, with progress saved in the browser.
- **Scripture quiz:** verse-to-book and reference-to-verse rounds with local best scores.
- **Prayer journal:** local prayer entries and a reminder while the page remains open.
- **Sermon notebook:** capture message titles, speakers, dates, Scripture references, key insights, personal notes, and practical responses; search, edit, export, and sync private entries.
- **Optional encrypted cloud sync:** use your own Supabase project and email-link sign-in to manually sync an encrypted backup between devices. The app never sends your sync passphrase.
- **Account profile:** after signing in, optionally add a display name, country or region, a short bio, and a user-selected profile image or video. Images are resized in the browser; videos can be up to 50 MB and are uploaded to a private per-account storage folder.
- **Discover:** curated Christian resource links and a web-search handoff. External services require an internet connection.
- **Prince Oscar AI Video Studio:** the storyboard tool plus a local-only Runway video generator. It creates short text-to-video clips (5 or 10 seconds), polls task status, previews the MP4, and saves the MP4 under generated-videos/.

## Current limits

The video generator requires a Runway Dev account, an API key, and paid credits. The API key stays in a local .env file and the server binds to 127.0.0.1 only. Video prompts are sent to Runway; Bible notes, prayers, and storyboard drafts are not. Do not expose this local server publicly without authentication and access controls. The page asks for an explicit charge confirmation before each generation. Current estimated rates are 5 credits/second for Gen-4 Turbo and 12 credits/second for Gen-4.5; the provider's final charge can vary.

Daily Word has no built-in hosted account or sync service. You can continue to use it entirely locally, or configure the optional Supabase sync using your own project. Sync is manual and uses your same strong passphrase on each device to encrypt personal app data in the browser with the existing AES-GCM backup format. Supabase receives only the encrypted envelope; account authentication is handled by your own Supabase project. Offline edits are merged on the next sync, including sermon-note deletions. Keep the passphrase and make encrypted file backups: a lost passphrase cannot recover the cloud copy. Browser storage is not a substitute for a backup. Account profile details and images/videos are optional, private to the signed-in user, and are not publicly browsable or shared with other users. Images are resized client-side and videos up to 50 MB are uploaded to the account's private storage folder; media subject matter is not restricted. Read-aloud uses speech provided by your browser/device and may not be available in every voice or offline. A page-open reminder can run only while its page remains open; a downloaded calendar reminder is managed by your calendar app. Video generation currently produces one short visual clip, not narration, captions, or a finished multi-scene explanation.

The homepage artwork is an original, offline SVG landscape illustration. Profile photos are optional, user-selected account images; no photo is required to use Daily Word.

## Run and install Daily Word

1. Make sure Node.js 20 or newer is installed.
2. Double-click `start-daily-word.cmd` to start the local app server. A Runway key is **not** required to read, study, use the Bible reader, or install the app.
3. Open http://127.0.0.1:4173/ in your browser. Keep the server window open while using the app.
4. Choose **Install Daily Word** when your browser offers it. Visit the pages you need while online so they are available from the offline cache.
5. Close the server window when you are finished.

Opening `index.html` directly still works for the basic browser experience, but browser security prevents service-worker installation from a `file://` address. The local server is required for installation, offline caching, and the video studio. The server uses Node.js built-ins; there is no package installation step.

### Use it on a phone, tablet, or another computer

The responsive website works in current browsers on Android, iPhone, iPad, Windows, macOS, and Linux. To install it, publish the static app to a secure HTTPS host such as Cloudflare Pages, then visit the resulting web address on each device:

- **Android:** open the HTTPS address in Chrome or Edge and choose **Install app** or **Add to Home screen**.
- **iPhone or iPad:** open it in Safari, tap **Share**, then **Add to Home Screen**.
- **Windows, macOS, or Linux:** use the install icon in Chrome or Edge, or choose **Install Daily Word** when offered.

For a basic Cloudflare Pages deployment, connect a private source repository containing this project, leave the build command empty, and set the build output directory to `.`. The included `_headers` file supplies browser security headers. Keep `.env`, API keys, and generated videos out of the repository and deployment. The local Runway video studio remains bound to this computer and is not part of the static cloud deployment.

#### Configure optional cross-device sync

1. Deploy Daily Word to HTTPS (for example Cloudflare Pages) and create a Supabase project. For use across Africa or other continents, choose a Supabase region close to most users and host the static app behind a global edge/CDN provider. Daily Word is browser-based and can be accessed internationally; accounts and cloud sync require a network connection, while cached readings and pages work offline.
2. In the Supabase SQL Editor, run `supabase-daily-word.sql`. It creates a private per-user vault, enables row-level security, and exposes only a revision-checked save function to authenticated users.
3. In Supabase Authentication → URL Configuration, set the deployed app origin as the Site URL and add the exact `/sync.html` URL to allowed Redirect URLs.
4. Open **Encrypted sync** in Daily Word. Enter the project URL and the public publishable/anon key from Supabase project API settings. Never use a `service_role` or secret key in a browser.
5. Request the email sign-in link and open it in the same browser. Optionally add account details and a profile image or video in the account section. On every device, use the same passphrase (minimum 12 characters) and choose **Sync now**.

Sessions are limited to the current browser tab. Cloud settings are kept only in that browser; the anon/publishable key is public by design and is protected by Supabase row-level policies, not by secrecy. Sync is explicit, not automatic. Concurrent writes are guarded by a revision check and retried with a conservative merge. Sermon-note deletions are represented by encrypted tombstones and carried across devices. Profile details and images/videos are optional and stored in the account owner's Supabase project; media is limited to the account's private folder. The cloud copy can be deleted from the sync page; this does not remove local data or delete the Supabase account. Verify a fresh project using test data and keep encrypted file backups. Supabase project setup, email delivery configuration, deployment, and credentials must be provided by the app owner; the code cannot create or host an account on your behalf. Global reach depends on deploying the static app to a CDN and selecting a suitable Supabase region; offline reading works on devices where the app shell and Bible text have already been cached, while login and cloud sync require internet access.

To move personal data between devices, open **Settings & privacy → Download encrypted backup** on the first device, keep the backup file and passphrase, then open Daily Word on the second device, select **Restore and merge backup**, and choose the file. Existing notes on the second device are kept; saved lists and completed days are merged.

## Local server safeguards

The local server binds to loopback only, rejects cross-origin state-changing requests, limits request sizes, and serves only approved static file types from inside the app. It does not expose `.env` or generated videos as static files. Responses include a restrictive Content Security Policy and browser security headers. Video generation also has a ten-request-per-hour limit per server session, explicit charge confirmation, validated model/duration/framing options, and a 250 MB streaming-download limit.

These are safeguards for a single-user local app—not authentication or protection against other programs running on the same computer. Do not forward the port, bind the server to a public interface, or deploy it to a public host. Run the full test suite with `node --test tests\app-shell.test.mjs tests\calendar-reminder.test.mjs tests\cloud-sync.test.mjs tests\data-protection.test.mjs tests\home-dashboard.test.mjs tests\sermon-notes.test.mjs tests\video-server.security.test.mjs`.

## Run the local video generator

1. Copy .env.example to .env and set RUNWAYML_API_SECRET to your Runway Dev API key. Keep .env private.
2. Double-click start-video-studio.cmd. Leave its terminal window open while using the studio.
3. Open http://127.0.0.1:4173/video-studio.html in your browser.
4. Write the visual prompt, choose model and duration, review the estimated cost, check the charge confirmation, and select Generate AI video.

Requires Node.js 20 or newer and network access to Runway. The browser-only file:// page cannot call this local backend; use the local address above. Runway output links expire, so the backend downloads successful clips to generated-videos/ on this computer.

## Text and rights

The included WEB text is the current eBible.org World English Bible Protestant edition, refreshed through the 22 October 2026 corrections, and is public domain: https://ebible.org/details.php?id=engwebp. See the official change log: https://worldenglish.bible/webupdates.php. The KJV 1769 text is distributed through eBible.org; territory-specific printing restrictions can apply in the United Kingdom: https://ebible.org/bible/details.php?all=1&id=eng-kjv2006. Check rights for images, music, and linked third-party material before reuse or commercial distribution.

© 2026 Prince Oscar. All rights reserved for original site design and materials. Third-party Bible editions and resources retain their respective terms.

Video API documentation: https://docs.dev.runwayml.com/guides/using-the-api/ and pricing: https://docs.dev.runwayml.com/guides/pricing/.
