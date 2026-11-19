# Plugins

Intray ships two optional plugins: **Google Calendar** and **Notion**. Mail works with neither of them connected. There is no plugin gallery of unfinished integrations, and there is no Intray server in the path. Credentials stay on this device, encrypted with the OS (`safeStorage`: DPAPI on Windows, Keychain on macOS).

Open them from the rail plug icon (**Add plugin**).

## Google Calendar

What it needs:

- The same Google OAuth desktop client as Gmail (`GMAIL_CLIENT_ID` or `GOOGLE_CLIENT_ID`, and the secret if that client is confidential).
- The **Google Calendar API** enabled on that client.
- Scopes requested at connect time: `calendar.events`, `userinfo.email`, and `openid`. Intray does not ask for full calendar access.

What it does with email:

- The calendar itself opens from the Apps rail. It is not pinned on unrelated mail.
- When an open message contains a Google Meet, Zoom, Teams, Webex, calendar file, or calendar invitation, **Add** under the subject creates that meeting after you confirm. The time is filled in when the email states one. An existing Meet link is saved on the event.
- The toolbar **Add to Google Calendar** can still create one event from any email: title, start, end, and a description taken from the sender and the message text.
- Optionally invites the sender (Google sends that invitation only when the box is checked).
- Optionally attaches a new Google Meet link, unless the email already has one.
- The plugin switch hides those mail actions without logging out. The saved Google sign-in stays on the device. The calendar page still opens while you are signed in.

Tokens are stored as the secret `plugin.google-calendar.tokens`. **Log out** deletes that secret and clears the saved account email. Turning the plugin off does not.

## Notion

What it needs:

- An internal integration token from [notion.so/my-integrations](https://www.notion.so/my-integrations).
- The database or page shared with that integration. Notion only returns destinations the integration can see.
- A destination chosen once in the plugin panel.

What it does with email:

- When Notion is on, the open message shows where the thread will be saved.
- **Save to Notion** creates one page titled with the subject.
- The page body includes the sender, the date, and the thread text.
- In a database, Intray fills the title column and only columns that already match an email, a date, or a sender. It does not invent properties, so a normal notes or tasks database is not rejected.
- Under a parent page, it creates a child page with a title.

The token is stored as the secret `plugin.notion.token`. The destination id and title are non-secret config in the local `plugins` table. **Log out** deletes the token and the destination. Turning Notion off keeps both.

## Request a plugin

From **Add plugin**, use **Request a plugin**. That opens a prefilled email to `hello@intray.app`, or a GitHub issue with the label `plugin-request`. Say which tool it is and what it should do with a single email or thread.

## Build one

Plugins are modules in the desktop app, not packages downloaded at runtime. A new plugin follows the same shape as Calendar and Notion.

1. Add an id to `PluginId` and a catalog entry in `apps/desktop/src/shared/plugins.ts`. The catalog is the only list **Add plugin** shows.
2. Implement the main-process module under `apps/desktop/src/main/plugins/`.
3. Store credentials with `savePluginSecret`. Never put a token in `config_json`, localStorage, or a renderer prop.
4. Store non-secret choices (account label, destination id) with `savePluginConfig`.
5. Register IPC handlers in `apps/desktop/src/main/ipc/register.ts`, and expose them on `window.intray.plugins` in `apps/desktop/src/preload/index.ts`.
6. Add the connect flow in `apps/desktop/src/renderer/PluginModal.tsx`.
7. If the plugin acts on the open message, add a reader action in `apps/desktop/src/renderer/PluginMailActions.tsx` that appears only while the plugin is connected and switched on. Pin the same information on the open message.

Rules that keep a plugin in line with the rest of Intray:

- It stays off until the user connects it. After that, an on/off switch hides it from mail without deleting the secret.
- It may send outward only the message the user just confirmed.
- It does not upload the mailbox, and it does not sync a third-party workspace back into Intray.
- Logging out removes the secret and clears that plugin’s config. Mail rows stay untouched. Turning the plugin off does not.
- Network calls set a timeout and surface the provider’s error text. Do not swallow a failed connect and pretend it worked.
