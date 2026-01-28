
# Enable push notifications

Push notifications require **explicit permission**.

The app will ask for permission when you enable push notifications. If you click **Deny/Block** (or your browser auto-blocks prompts), the browser **won’t show the permission prompt again**, and the app can’t override that. In that case you must re-enable notifications from your **browser settings**.

## Desktop (Windows / macOS / Linux)

### Chrome / Chromium / Edge (website in the browser)

1. Open the app website.
2. Click the **lock** (or site icon) next to the address bar.
3. Open **Site settings** (or **Permissions**).
4. Set **Notifications** to **Allow**.

Alternative path:

- Open browser **Settings** → **Privacy and security** → **Site settings** → **Notifications**, then move the site from *Blocked/Not allowed* to *Allowed*.

### Chrome (installed PWA)

Installed PWAs use the same site permission underneath.

1. Allow notifications for the site (steps above).
2. Check OS notifications:
	- **Windows:** Settings → System → Notifications → ensure the PWA/browser is allowed.
	- **macOS:** System Settings → Notifications → ensure the PWA/browser is allowed.
	- **Linux:** ensure desktop notifications are enabled for your session/DE.

### Firefox (website in the browser)

1. Open the app website.
2. Click the **padlock** in the address bar.
3. Open **More information** / page info → **Permissions**.
4. Under **Send Notifications**, choose **Allow** (or remove a previous Block so Firefox can ask again).

### Safari (macOS)

1. Safari → **Settings…** → **Websites** → **Notifications**.
2. Find the site and set it to **Allow**.

Also check macOS:

- System Settings → **Notifications** → find the website (or Safari) → **Allow Notifications**.

## Android

### Chrome (browser tab or installed PWA)

1. Open the app website.
2. Tap the **lock** (or site icon) → **Site settings**.
3. Set **Notifications** to **Allow**.

Also check Android system settings:

- Settings → **Apps** → (Chrome or the installed web app) → **Notifications** → enable.

### Firefox (Android)

1. Firefox → **Settings** → **Site permissions** → **Notifications**.
2. Move the site to **Allowed** (or remove it from Blocked so Firefox can ask again).

## iPhone / iPad (iOS / iPadOS)

iOS/iPadOS supports web push notifications for **Home Screen web apps (installed PWAs)** on iOS/iPadOS **16.4+**. You generally **won’t receive web push notifications from a normal browser tab**.

### Safari (installed PWA)

If you haven’t installed the app yet:

1. Open the app website in **Safari**.
2. Tap **Share** → **Add to Home Screen**.
3. Open the app from your **Home Screen**.

Grant/re-grant permission:

1. In the app, trigger the permission request and tap **Allow**.
2. If you previously tapped **Don’t Allow**, re-enable it in iOS:
	- Settings → **Notifications** → select the app’s Home Screen web app entry → enable **Allow Notifications**.

### Chrome / Firefox (iOS)

Chrome/Firefox on iOS don’t receive web push notifications from a normal browser tab.

To receive push notifications on iOS/iPadOS, use **Safari** and install the app as a **Home Screen web app** (Add to Home Screen), then grant permission there.

## Additional considerations

- Notifications don’t work in **private/incognito** windows.
- Your device/OS can block notifications globally (Focus/Do Not Disturb, battery optimizations, system-level notification toggles).
- Some browsers may **remove notification permission** for sites you haven’t visited in a while; if that happens, revisit the site and re-allow notifications.
