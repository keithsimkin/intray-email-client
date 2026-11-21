import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy — Intray",
  description:
    "How Intray accesses, uses, stores, shares, and deletes data, including Google account data, on your computer and on intray.site.",
  alternates: { canonical: "/privacy" },
};

const GOOGLE_POLICY = "https://developers.google.com/terms/api-services-user-data-policy";
const GOOGLE_PERMISSIONS = "https://myaccount.google.com/permissions";

export default function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Privacy Policy"
      lede={
        <>
          <p>
            Intray is a desktop email client for Windows and macOS Apple Silicon. The app
            fetches mail from your providers onto the computer where it is installed. This
            policy describes that desktop app and the website at{" "}
            <a href="https://intray.site">https://intray.site</a>.
          </p>
          <p>
            Questions about this policy go to{" "}
            <a href="mailto:hello@intray.site">hello@intray.site</a>.
          </p>
        </>
      }
    >
      <section id="summary">
        <h2>Summary</h2>
        <ul>
          <li>
            Gmail OAuth runs in the desktop app. Google redirects to a page on{" "}
            <strong>127.0.0.1</strong>, and the app exchanges the code with Google directly.
          </li>
          <li>
            Messages, attachments, and OAuth tokens are stored on that computer. Tokens and
            mailbox passwords are encrypted with the operating system’s secure storage before
            they are saved.
          </li>
          <li>
            The Intray website does not receive your mail or your tokens. It handles
            downloads, checkout, and purchase email.
          </li>
          <li>
            AI requests and the local MCP server move mail only when you use those features.
            Intray does not use that data to train models.
          </li>
        </ul>
      </section>

      <section id="google">
        <h2>Google user data</h2>
        <p>
          Connecting Gmail with Google opens your browser to Google’s authorization page. The
          desktop app listens on <strong>127.0.0.1</strong> for the redirect, checks the{" "}
          <strong>state</strong> value, and uses PKCE (<strong>S256</strong>). It then
          exchanges the authorization code at{" "}
          <a href="https://oauth2.googleapis.com/token">https://oauth2.googleapis.com/token</a>.
          That redirect does not pass through intray.site.
        </p>
        <p>The Gmail connection requests these scopes:</p>
        <ul>
          <li>
            <a href="https://www.googleapis.com/auth/gmail.modify">
              https://www.googleapis.com/auth/gmail.modify
            </a>{" "}
            — read messages, headers, labels, history, and attachments, and apply the mailbox
            changes you make (labels, archive, read or unread, spam, trash, and permanent
            delete).
          </li>
          <li>
            <a href="https://www.googleapis.com/auth/gmail.send">
              https://www.googleapis.com/auth/gmail.send
            </a>{" "}
            — send mail you compose, including replies on an existing thread.
          </li>
          <li>
            <a href="https://www.googleapis.com/auth/userinfo.email">
              https://www.googleapis.com/auth/userinfo.email
            </a>{" "}
            — the Google account’s email address.
          </li>
          <li>
            <a href="https://www.googleapis.com/auth/userinfo.profile">
              https://www.googleapis.com/auth/userinfo.profile
            </a>{" "}
            — the account name and profile photo.
          </li>
          <li>
            <strong>openid</strong> — the OpenID identifier that accompanies that profile.
          </li>
        </ul>
        <p>
          The app asks Google for offline access, so Google can return a refresh token. The
          desktop app stores the access token and refresh token on the computer and refreshes
          the access token with Google when it expires. Profile fields requested from Google’s
          userinfo endpoint are the email address, name, and picture URL. If userinfo is
          unavailable, the app reads the mailbox email address from the Gmail profile.
        </p>
        <p>
          Gmail can also be added with IMAP and an app password instead of this OAuth flow.
          Outlook, iCloud, Yahoo, Fastmail, and other IMAP mailboxes use IMAP and SMTP with
          the password you enter. Those passwords are encrypted on the device the same way as
          OAuth tokens. The app opens TLS connections from your computer to those providers.
        </p>
      </section>

      <section id="use">
        <h2>How Google user data is used</h2>
        <p>Intray uses Google user data to run the mail client on your computer:</p>
        <ul>
          <li>Show which Google account is connected, including its name and profile photo.</li>
          <li>List, search, and read messages in the app on your computer.</li>
          <li>Download an attachment when you preview, save, or open it.</li>
          <li>Apply label, archive, read, spam, trash, and delete actions you take in the app.</li>
          <li>Send messages you compose.</li>
          <li>Keep the local copy current with Gmail history.</li>
        </ul>
        <p>
          Intray does not sell Google user data. Intray does not use Google user data for
          advertising. Intray does not use Google user data to train machine-learning models.
          People operating Intray do not receive your mailbox through the product. A message
          you send to <a href="mailto:hello@intray.site">hello@intray.site</a> is read so it
          can be answered.
        </p>
        <p>
          Remote images inside a message stay unloaded until you allow them. Allowing them
          requests those images from the servers named in the message.
        </p>
      </section>

      <section id="calendar">
        <h2>Optional Google Calendar</h2>
        <p>
          The Google Calendar plugin is off until you connect it. Connecting it starts a
          separate loopback sign-in, again with PKCE, and requests{" "}
          <a href="https://www.googleapis.com/auth/calendar.events">
            https://www.googleapis.com/auth/calendar.events
          </a>
          ,{" "}
          <a href="https://www.googleapis.com/auth/userinfo.email">
            https://www.googleapis.com/auth/userinfo.email
          </a>
          , and <strong>openid</strong>. The app reads events on your primary calendar and
          creates, edits, or deletes events you confirm in the app. Calendar tokens are
          encrypted on the device. Disconnecting the plugin deletes the saved calendar token
          from the app. Intray does not store your calendar on an Intray server.
        </p>
      </section>

      <section id="storage">
        <h2>How data is stored</h2>
        <p>
          The app keeps a SQLite database named <strong>intray.sqlite</strong> in its
          user-data folder. That database holds accounts, messages, message bodies, contacts,
          and encrypted secret blobs. With the application name Intray, the folder is{" "}
          <strong>%APPDATA%\Intray</strong> on Windows and{" "}
          <strong>~/Library/Application Support/Intray</strong> on macOS.
        </p>
        <p>
          OAuth tokens, IMAP and SMTP passwords, AI provider keys, the MCP bearer token, and
          plugin tokens are encrypted with Electron <strong>safeStorage</strong> before they
          are written. That uses Windows DPAPI or the macOS Keychain. Message text in the
          database is the local mail cache. Attachment files you download for preview are
          cached in an <strong>attachment-cache</strong> folder in the same user-data
          directory.
        </p>
        <p>
          The app has on-device switches for analytics and crash reports. Both default to
          off. The app does not send analytics or crash reports to Intray. A read-status
          switch, also off by default, stores a local note of messages you send. Intray does
          not host a tracking server and does not add an Intray tracking image to sent mail.
        </p>
        <p>
          Installed copies check the project’s GitHub releases for a newer version. That
          check does not include mailbox contents or OAuth tokens.
        </p>
      </section>

      <section id="transfers">
        <h2>When data leaves the computer</h2>
        <p>
          Sync, send, and token refresh talk to Google, or to the IMAP and SMTP servers you
          configured, from the desktop app. Beyond that, mailbox data leaves the Intray
          process in the cases below. Each one is started by something you do. Intray does
          not use the transferred text to train models, and Intray does not receive a copy of
          it on an Intray server.
        </p>
        <p>
          <strong>AI you invoke.</strong> Ask, summarize, translate, suggested replies,
          labeling, and similar actions send a prompt from the desktop app to the provider
          you picked. The prompt can include the thread text, subject, sender, and preview
          needed for that action. The request uses your own key or a tool already signed in
          on the computer:
        </p>
        <ul>
          <li>OpenAI at api.openai.com, with your API key.</li>
          <li>Anthropic at api.anthropic.com, with your API key.</li>
          <li>Google Gemini at generativelanguage.googleapis.com, with your API key.</li>
          <li>xAI at api.x.ai, with your API key, or the local Grok command-line tool.</li>
          <li>
            Ollama on this computer only. The default address is http://127.0.0.1:11434.
            If a saved Ollama address is not local, the app uses 127.0.0.1 instead.
          </li>
          <li>
            A local command-line tool on the computer, such as Claude Code, Codex, the Cursor
            agent, or OpenCode.
          </li>
        </ul>
        <p>
          Those providers apply their own terms to the request. Intray does not train models
          on the prompt.
        </p>
        <p>
          <strong>Local MCP.</strong> While Intray is running it listens on{" "}
          <strong>127.0.0.1</strong>, usually port <strong>47821</strong>, or another local
          port if that one is taken. A program on the same computer can search mail, read a
          thread, and list accounts after you give it the bearer token shown in Settings.
          Browser pages are rejected. You can stop the server and rotate the token under{" "}
          <strong>Settings → AI &amp; agents</strong>. Stopping it lasts until you quit;
          Intray starts the listener again the next time the app opens, and you can stop it
          again there. Cursor, Claude, and similar tools read mail only after you connect
          them with that token. What those tools do with the text afterward is controlled by
          you and by that tool. Intray does not use MCP output to train models.
        </p>
        <p>
          <strong>Notion.</strong> If you connect the Notion plugin and save a thread, the
          app sends the subject, sender, date, and message text to Notion’s API with the
          integration token you provided. That token is encrypted on the device. Saving is
          the action that sends the thread. Intray does not keep your Notion workspace on an
          Intray server.
        </p>
        <p>
          <strong>Avatars.</strong> A Google profile photo URL may be stored locally and
          loaded so the account icon can be shown. For an address without a usable photo, the
          app may request an image from Gravatar using a hash of the email address. Message
          bodies are not sent to Gravatar.
        </p>
      </section>

      <section id="limited-use">
        <h2>Google API Limited Use</h2>
        <p className="rounded-2xl border border-white/10 bg-[#121214] px-5 py-4 text-white">
          Intray&apos;s use and transfer of information received from Google APIs to any other
          app will adhere to the{" "}
          <a href={GOOGLE_POLICY}>Google API Services User Data Policy</a>, including the
          Limited Use requirements.
        </p>
        <p>
          <a href={GOOGLE_POLICY}>{GOOGLE_POLICY}</a>
        </p>
      </section>

      <section id="retention">
        <h2>Retention and deletion</h2>
        <p>
          Mail and tokens stay on the computer until you delete them. Intray does not keep a
          server copy to retain or erase.
        </p>
        <p>
          <strong>Remove one mailbox.</strong> In Settings, open the account and choose{" "}
          <strong>Remove</strong>. Confirm the prompt. Intray deletes that account, its
          stored credentials, and its messages from the local database. The mailbox at Google
          or the other provider is left as it is. Sender addresses already saved in the local
          contacts list, and attachment files already written under{" "}
          <strong>attachment-cache</strong>, can remain until you delete the user-data folder.
        </p>
        <p>
          <strong>Revoke Intray at Google.</strong> Open{" "}
          <a href={GOOGLE_PERMISSIONS}>{GOOGLE_PERMISSIONS}</a> and remove Intray’s access.
          Google then stops granting that app access. Copies already stored on the computer
          remain until you remove the account in Intray or delete the user-data folder.
          Disconnecting the Calendar plugin deletes the calendar token saved in the app.
        </p>
        <p>
          <strong>Delete everything local.</strong> Quit Intray and delete the user-data
          folder: <strong>%APPDATA%\Intray</strong> on Windows, or{" "}
          <strong>~/Library/Application Support/Intray</strong> on macOS. That removes{" "}
          <strong>intray.sqlite</strong> (messages, tokens, API keys, a saved license key,
          and the MCP token) and{" "}
          <strong>attachment-cache</strong>. Uninstalling the app leaves this folder in
          place.
        </p>
      </section>

      <section id="website">
        <h2>The website, checkout, and email</h2>
        <p>
          intray.site is hosted on Netlify. It does not offer a mailbox login. Browsing it
          does not upload your mail.
        </p>
        <p>
          <strong>Checkout.</strong> The site offers a monthly plan at $10 per month and a
          lifetime plan at $75, both in the amounts shown on the site. Choosing a plan sends
          that choice to the site, which opens a Dodo Payments checkout for the matching
          product. You enter payment details on Dodo’s page. The site does not collect or
          store the card number. After payment, the browser returns to{" "}
          <a href="https://intray.site/thanks">https://intray.site/thanks</a>.
        </p>
        <p>
          When a one-time payment succeeds, or a subscription becomes active, Dodo notifies
          the site. The site uses the customer email and name from that notice to send a
          confirmation through Resend, from Intray &lt;hello@intray.site&gt;, and to email
          Intray’s support address with the customer name, email, amount, and payment
          reference. Webhook logs written by the site include the event type and Dodo’s
          payment, subscription, customer, and product ids. Purchase records remain with Dodo
          Payments, and the confirmation email is handled by Resend, under those companies’
          policies. Email <a href="mailto:hello@intray.site">hello@intray.site</a> to ask
          about a purchase.
        </p>
        <p>
          <strong>AppSumo redemption.</strong> The redeem page takes an AppSumo code and an
          email address. The site hashes the code and checks that hash against a list of
          code hashes. It does not store the code itself. A successful redemption stores the
          email, a license id, the signed license key, and the time in Netlify Blobs, and
          emails the key through Resend from Intray &lt;hello@intray.site&gt;. Submitting the
          same code and email again returns the same key. The desktop app verifies that key
          on the computer and stores it with OS secure storage. Checking the key does not
          send it, or any mail, to Intray.
        </p>
        <p>
          <strong>Downloads.</strong> The download links ask GitHub’s API which Windows or
          macOS Apple Silicon installer is current, then redirect your browser to that file
          on GitHub. The site does not create an account for the download.
        </p>
        <p>
          <strong>Local storage.</strong> The site banner stores your choice,{" "}
          <strong>accepted</strong> or <strong>essential</strong>, in the browser under the
          key <strong>intray-cookie-consent</strong>. That value stays on your device. Both
          choices only record the preference. The site does not set analytics or advertising
          cookies.
        </p>
        <p>
          <strong>Page views.</strong> Pages load a script from{" "}
          <a href="https://www.ship-or-die.com/hackathon/verify.js">
            https://www.ship-or-die.com/hackathon/verify.js
          </a>
          . That script states that it sets no cookies and no persistent browser identifier.
          It sends the page path, the referring site’s origin, <strong>utm_source</strong>,{" "}
          <strong>utm_medium</strong>, and a yes-or-no flag if the address contains a common
          ad-click parameter. It does not send mailbox data. It does not run when the
          browser’s Global Privacy Control signal is on.
        </p>
        <p>
          Netlify and your browser exchange ordinary connection data, such as IP address and
          the requested URL, to deliver the site.
        </p>
      </section>

      <section id="changes">
        <h2>Changes</h2>
        <p>
          Updates to this policy are posted on this page, and the date at the top changes
          with them. The <Link href="/terms">Terms of Service</Link> cover the website and
          the paid plans.
        </p>
      </section>

      <section id="contact">
        <h2>Contact</h2>
        <p>
          <a href="mailto:hello@intray.site">hello@intray.site</a>
        </p>
      </section>
    </LegalDocument>
  );
}
