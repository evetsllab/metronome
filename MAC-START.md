# Mac start — copy these on your Mac, one at a time

You're reading this in your Mac's browser, so every code block below has a
**copy button** (top-right of the box). Click it, paste into the app named,
press Enter. No typing.

---

## 1. Install Claude Code  → paste into **Terminal**

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Wait for it to finish (a minute or two).

## 2. Open a **NEW** Terminal window

Cmd-N in Terminal. (The new command only works in a fresh window.)

## 3. Go to your projects folder + launch Claude → paste into the new Terminal

```bash
cd ~/Documents && claude
```

The first time, it will ask you to **sign in** — a browser opens, log in to your
Claude account, done.

## 4. Hand Claude the job → paste this into **Claude** (not Terminal)

```text
Clone my private repo https://github.com/evetsllab/metronome.git into this folder, then read CLAUDE.md and continue the iOS App Store build. It's a private repo so walk me through GitHub sign-in. My GitHub username is evetsllab.
```

That's it — from here the Mac's Claude does everything locally and you never
copy between machines again.
