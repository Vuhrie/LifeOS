# Google Calendar Setup

This app uses Google Identity Services (OAuth token model) and the Google Calendar REST API with readonly access.

## 1. Create OAuth Client

1. Open Google Cloud Console.
2. Create or select your project.
3. Enable **Google Calendar API**.
4. Configure OAuth consent screen.
5. Create an OAuth client of type **Web application**.

## 2. Add Allowed Origins

Add every URL where LifeOS will run:

- Local development origin (example: `http://127.0.0.1:4173`)
- Cloudflare production origin (example: `https://lifeos.derpdiepie8523.workers.dev`)

## 3. Configure LifeOS

Update `public/scripts/config.js`:

```js
window.LIFEOS_CALENDAR_CONFIG = {
  googleClientId: "YOUR_CLIENT_ID.apps.googleusercontent.com",
  calendarId: "primary",
  authPersistence: "local",
  authDurationSeconds: 3600,
  refreshSkewSeconds: 120,
};
```

`calendarId` can remain `primary` or be set to a specific Google Calendar ID.
`authPersistence` can be `local` (persist across tabs/reloads) or `session` (browser-tab session only).

## 4. Validate

1. Open `Today` or `Schedules`.
2. Confirm there is no sign-in popup on initial page load.
3. Click **Connect Google** to start interactive sign-in.
4. Grant readonly calendar access.
5. Confirm events load correctly.
