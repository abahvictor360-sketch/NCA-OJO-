Desktop app for **NCA Ojo Attendance** (New Creation Assembly Ojo, Overcomers Parish).

## What's new in 1.1.0

- **No more endless loading spinner.** If the internet is slow or down when the app starts, it now shows a
  "Could not open the app" message with **Try again**, instead of spinning forever.
- **Admins no longer wrongly see "No access"** when part of the data fails to download.
- **Tablet friendly.** On tablets the menu becomes a slim bar of icons, page buttons stay on one line,
  and Finance totals fit inside their cards.
- **Easier admin invites.** Each admin has a **Copy invite** button, and adding an admin shows the link with
  Copy and WhatsApp buttons. The link opens straight on **Create your password** with their email filled in.
  If the link is opened on a device where someone else is signed in, it explains how to switch.

## Downloads

**Windows**
- **NCA-Ojo-Attendance-Setup-1.1.0.exe**: installer with Start menu and desktop shortcuts.
- **NCA-Ojo-Attendance-Portable-1.1.0.exe**: single file, runs without installing.

**macOS** (pick your Mac type: Apple menu > About This Mac. "Chip: Apple M..." = Apple Silicon, "Processor: Intel" = Intel)
- **NCA-Ojo-Attendance-1.1.0-mac-AppleSilicon.dmg**: M1, M2, M3, M4 Macs.
- **NCA-Ojo-Attendance-1.1.0-mac-Intel.dmg**: older Intel Macs.
- The `.zip` files contain the same app, if you prefer not to use a .dmg.

## Updating from 1.0.0

Install over the old version. Your sign-in and the data saved on the computer are kept.
Changes not yet synced are kept too, but it is safest to let the app show **Synced** before updating.

## First run

**Windows:** if you see "Windows protected your PC", click **More info > Run anyway**.

**Mac:** open the .dmg and drag the app into Applications (replace the old one). The app is not notarized by Apple,
so the first time right-click the app > **Open** > **Open**. If macOS says the app "is damaged", open Terminal and run:
`xattr -cr "/Applications/NCA Ojo Attendance.app"`, then open it again.

Web version: https://nca-ojo-attendance.vercel.app
