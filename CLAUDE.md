# CLAUDE.md — iOS App Store build handoff (Tiny Orchestral Metronome)

> **Purpose of this file.** This is a cross-machine handoff. The baseline was
> prepped on Steve's **Windows** PC (where iOS builds are impossible); the real
> build continues on his **Mac**. If you are the Claude session on the Mac,
> read this top-to-bottom — it saves you re-analyzing the 9,300-line app.

## STATUS (updated)
Steps 1–7 are **built and verified on Windows** and committed:
1. ✅ Capacitor 6 iOS project (appId com.steveball.metronome, name "Accelerating Metronome").
2. ✅ Web app embedded in `www/`; self-contained, loads offline.
3. ✅ Native AVAudioSession (.playback) in AppDelegate; MediaStreamDestination
   bypassed natively, kept for web; background-audio mode + portrait-only in Info.plist.
4. ✅ Look-ahead scheduler verified running clean (browser test, no errors).
5. ✅ Quotes stripped to 1,163 (Steve Ball 667 + Guitar Craft 466 + Steve Turnidge 30);
   "SB" renders as "Steve Ball" linked to steveball.com. Gist sync UI + network paths removed.
6. ✅ Haptic-on-beat toggle (Taptic Engine, native-only, default off).
7. ✅ App icon + launch screen = exact reproduction of the real dial (bezel, 120-at-top,
   red pointer, Guitar Craft knot). Sources in `assets/` (icon.png, dial.svg, knot.png).

**Remaining (Mac only — see `MAC-BUILD.md`):** step 8 App Store screenshots via the
iOS Simulator (⌘S at 6.9"/6.5"), and step 9 signing + archive + upload in Xcode.
Screenshots need the Simulator because Windows can't produce exact-device-resolution
captures — MAC-BUILD.md step 4 makes it a 2-minute job.

## Who / what
- **Owner:** Steve Ball (steveball@steveball.com), Ballistic Music, Seattle.
  He owns this app outright (design, code, sounds, artwork) — repackaging it is
  fully authorized. He is **not deeply technical**; walk him through anything
  hands-on **one step at a time**, and don't pile on choices. Pick sensible
  defaults, state them, and let him override.
- **The app:** `index.html` — a single-file web app, "Tiny Orchestral
  Metronome" v2.24 (~9,373 lines, ~840 KB). Supporting files: `index.js`,
  `sw.js` (service worker), `FAQ.html`, `.htaccess`. Live at
  https://steveball.com/metronome/ .
- **Repo:** https://github.com/evetsllab/metronome (private). GitHub username
  `evetsllab`. `main` branch. `Archive/` and `_pgbackup/` are git-ignored (32 MB
  of old backups — stay on the Windows PC, not needed here).

## The goal (Steve's original 9-step brief)
Build an **iOS App Store release** of the web app using **Capacitor 6**,
targeting **iOS 16+, iPhone only for v1**.

1. **Scaffold** a Capacitor 6 project. Bundle ID **[DECISION PENDING]**, app name
   **[DECISION PENDING]** (see Open Decisions below).
2. **Embed** the HTML app as the web asset; verify it loads **offline**.
3. **Native audio bridge:** configure `AVAudioSession` (category `.playback`,
   activated on first user interaction) so audio plays through the speaker,
   **survives the silent switch**, and behaves when backgrounded. **Bypass the
   `MediaStreamDestination` workaround when running natively; keep it for web.**
4. **Verify the look-ahead scheduler** runs cleanly in WKWebView; fix throttling
   if any (background/hidden-tab timer throttling is the risk).
5. **Strip the quote corpus to only quotes attributed to Steve Ball.** Remove the
   **GitHub Gist sync** UI + all code paths. Practice history stays in
   `localStorage`.
6. **Optional haptic-on-beat** via Taptic Engine, as a **toggle, default OFF**.
7. **Icon set** from a 1024×1024 source (Steve provides, OR draft a **SEIKO SQ70**
   -aesthetic placeholder) + launch screen.
8. **Build to the iOS Simulator**; take App Store screenshots at **6.9"** and
   **6.5"** showing: main face, a practice session, the quote display.
9. **Xcode archive** for App Store distribution; walk Steve through **signing**
   with his Apple team; upload via **Xcode Organizer or fastlane**.
   (Steps 8–9 are Mac-only — that's why we're here.)

## Key findings in `index.html` (line numbers as of v2.24 baseline)
- **AudioContext:** `const AC = window.AudioContext || window.webkitAudioContext;`
  at **~2923**.
- **Look-ahead scheduler:** engine comment header at **~3280**; retro-tempo /
  lookahead-window logic ~3175, ~3348.
- **`MediaStreamDestination` iOS routing workaround** to bypass natively:
  **~4219** (`if (!window._iosRouterEl && ctx.createMediaStreamDestination)` →
  builds `msDest = ctx.createMediaStreamDestination()`). Gate this on
  `!Capacitor.isNativePlatform()` so web keeps it, native skips it and connects
  straight to `ctx.destination`.
- **Quote corpus:** `<script type="text/plain" id="tomQuoteSource">` opens at
  **7413**; quote lines **7414–9225** (1,803 total). Author→link map
  `id="tomQuoteLinks"` at **9226**; source map `id="tomQuoteSources"` at **9367**.
- **Steve's quotes are tagged `- SB`** (647 of them, lines ~7760–8657, incl.
  `- SB | YouTube` and `- SB | Innerviews` source variants). Stripping to
  SB-only = keep those 647, delete the other 1,156. NOTE: `SB` is **not** in the
  `tomQuoteLinks` map (only `RF | robertfripp...` is) — **verify how `SB`
  resolves to a name/link** in the parse code (search `SB` near the quote parser
  ~6989 "Direct quotes arrive as") before deleting, so attribution still renders.
  Also update visible counts: **"1,803"** appears at ~2499 and ~2505
  (`0 / 1,803 seen`) — retarget to 647.
- **Gist sync to remove:** UI block ~2583–2593 (`syncGistId` input); the whole
  `PROFILE & GITHUB GIST SYNC` section starting **~5299** (functions
  `syncGetGistId`, `syncPush`, `syncPull`, ~5319–5646); and auto-sync call sites
  at ~5148, ~5959, ~5977, ~6068, and the quote-merge at ~6286. Leave the
  `localStorage` practice-log engine intact — only cut the cloud paths.
- **Service worker** `sw.js` handles offline for web. Under Capacitor the assets
  are local anyway; decide whether to keep/neuter the SW in the native bundle
  (it can interfere with the WKWebView asset scheme — likely disable it natively).

## Open decisions (Steve dismissed these once on Windows — confirm on Mac)
1. **Bundle ID** — recommend `com.steveball.metronome`. Must match his Apple
   Developer account.
2. **App name** — recommend Store: "Tiny Orchestral Metronome", home-screen:
   "Metronome" (iOS shows ~12 chars).
3. **Icon** — offer to draft a SEIKO SQ70 placeholder, or use his 1024×1024 PNG.
4. He was moving to a Mac **with Xcode assumed** — confirm Xcode + CocoaPods are
   installed first.

## How to continue on the Mac
1. `git clone https://github.com/evetsllab/metronome.git`
2. Confirm the 4 open decisions above.
3. Proceed through steps 1–9. Keep the **web** build working (steveball.com
   still serves `index.html`) — guard native-only changes behind
   `Capacitor.isNativePlatform()` so the same file serves both.
4. Commit early and often; push to the same repo so both machines stay in sync.

## Environment note
Baseline (this file + the app files) committed on Windows. `git config` identity
is set to Steve Ball / steveball@steveball.com. On the Mac, `git` identity may
need setting again the same way.
