# Mac finish-line runbook — Accelerating Metronome

Everything below runs **on your Mac**, in **Terminal** and **Xcode**. Open this
file in your Mac's browser (github.com/evetsllab/metronome → MAC-BUILD.md) and
use the copy buttons. Prerequisite: **Xcode** installed from the App Store, and
its command-line tools (`xcode-select --install`).

The app itself is fully built and committed. These steps only cover the parts
Apple requires a Mac for: CocoaPods, signing, screenshots, archive, upload.

---

## 1. Get the project + install native dependencies

```bash
cd ~/Documents
git clone https://github.com/evetsllab/metronome.git 2>/dev/null || (cd metronome && git pull)
cd metronome
npm install
sudo gem install cocoapods            # once, if you don't have CocoaPods
npx cap sync ios                      # installs Pods + copies web assets
```

## 2. Open in Xcode

```bash
npx cap open ios
```

That opens `ios/App/App.xcworkspace` in Xcode (always the **.xcworkspace**, not
the .xcodeproj).

## 3. Signing (one-time, with your Apple Developer account)

1. In Xcode's left sidebar click the blue **App** project → **App** target.
2. **Signing & Capabilities** tab.
3. Check **Automatically manage signing**.
4. **Team** dropdown → pick your Apple Developer team. (If it's empty:
   Xcode → Settings → Accounts → **+** → sign in with your Apple ID, then come
   back and pick the team.)
5. Bundle Identifier should read **com.steveball.metronome**. If Xcode says it's
   taken, change it here and tell me so I update the config.

## 4. Run on the Simulator + take App Store screenshots

App Store Connect wants two sizes. Use these simulators:

- **6.9"** → **iPhone 16 Pro Max**  (saves at 1320 × 2868)
- **6.5"** → **iPhone 11 Pro Max**   (saves at 1242 × 2688)

For each simulator:

1. Pick it in the device dropdown (top bar) and press **▶ Run**.
2. Once the app loads, capture three shots — in the Simulator press **⌘S** for
   each (saves a native-resolution PNG to your Desktop):
   - **Main face** — the dial as it opens.
   - **Practice session** — press **BEGIN** so the timer is running, then ⌘S.
   - **Quote display** — a quote card auto-appears; to force one immediately,
     in Xcode's console isn't needed — just wait, or tap the Practice Quotes
     area. Capture while a Steve Ball / Guitar Craft / Turnidge quote is showing.

⌘S screenshots are already the exact pixel sizes App Store Connect requires — no
resizing needed. You upload three per size (6 total) when you create the listing.

## 5. Archive for the App Store

1. Device dropdown → **Any iOS Device (arm64)** (not a simulator).
2. Menu **Product → Archive**. Wait for it to build.
3. The **Organizer** window opens with your archive.

## 6. Upload

In the Organizer, with the archive selected:

1. **Distribute App** → **App Store Connect** → **Upload** → Next through the
   defaults → **Upload**.
2. Xcode signs and uploads. When it finishes, the build appears in
   **App Store Connect → your app → TestFlight/Builds** in ~5–15 min.

(You'll first need to create the app record at
https://appstoreconnect.apple.com → **My Apps → + → New App**, bundle ID
`com.steveball.metronome`, name "Accelerating Metronome".)

---

## If anything errors

Copy the red error text and send it to Claude on the Mac (or paste here). The
usual snags: no signing team selected (step 3), or CocoaPods not installed
(step 1). Both are quick fixes.
