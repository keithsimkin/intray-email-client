import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { GITHUB_URL } from "@/components/landing/site";

export const metadata: Metadata = {
  title: "Terms of Service — Intray",
  description:
    "Terms for the Intray website, downloads, and the $10/month and $75 lifetime plans sold through Dodo Payments.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Terms of Service"
      lede={
        <p>
          These terms cover the website at <a href="https://intray.site">https://intray.site</a>{" "}
          and purchases made there. The desktop application has its own copyright license,
          described below. The <Link href="/privacy">Privacy Policy</Link> describes how the
          app and the website handle data.
        </p>
      }
    >
      <section id="software">
        <h2>The software license</h2>
        <p>
          The Intray desktop application is free software under the{" "}
          <a href="https://www.gnu.org/licenses/gpl-3.0.html">
            GNU General Public License version 3
          </a>{" "}
          or any later version, together with the additional attribution terms in the{" "}
          <a href={`${GITHUB_URL}/blob/master/LICENSE`}>LICENSE</a> file shipped with the
          source. Those terms govern copying, modification, and redistribution of the
          software. If these Terms of Service conflict with the GPL about the software
          itself, the GPL controls.
        </p>
        <p>
          Intray is a desktop email client for Windows and macOS Apple Silicon. It connects
          from your computer to the mail providers you add. Source code and installers are
          published in the <a href={GITHUB_URL}>GitHub repository</a>.
        </p>
      </section>

      <section id="plans">
        <h2>Plans and payment</h2>
        <p>The website offers two paid plans, charged by Dodo Payments:</p>
        <ul>
          <li>
            <strong>Monthly — $10 per month.</strong> The plan renews until it is cancelled.
          </li>
          <li>
            <strong>Lifetime — $75, paid once.</strong> This purchase does not renew.
          </li>
        </ul>
        <p>
          The prices are the amounts shown on the site. Choosing a plan sends you to Dodo
          Payments to pay. Intray does not collect or store your card number. After a
          successful payment, the site emails the address Dodo provides a confirmation, from
          Intray &lt;hello@intray.site&gt;, through Resend.           Paying for a plan does not
          replace the GPL license of the software.
        </p>
        <p>
          <strong>AppSumo.</strong> A valid AppSumo code can be redeemed on this site for one
          lifetime license key, tied to the email address used at redemption. The desktop app
          checks that key on your computer. Redeeming a code does not replace the GPL license
          of the software.
        </p>
        <p>
          To cancel a monthly plan so it does not renew, email{" "}
          <a href="mailto:hello@intray.site">hello@intray.site</a>. Cancellation stops later
          charges. The period already paid is the current period. For a refund request, use
          the same address. The charge itself was processed by Dodo Payments.
        </p>
      </section>

      <section id="downloads">
        <h2>Downloads</h2>
        <p>
          Download links on the site ask GitHub for the latest Windows setup or the latest
          macOS Apple Silicon disk image, then redirect your browser to that file. GitHub
          hosts the installers. You can also take them from the project’s GitHub releases.
        </p>
      </section>

      <section id="accounts">
        <h2>Your mail accounts</h2>
        <p>
          Mail accounts you connect in the app are accounts you hold with those providers.
          You are responsible for having permission to access them. Google, and any IMAP or
          SMTP provider you configure, apply their own terms to those accounts. Intray is not
          the operator of Gmail, Outlook, iCloud, Yahoo, Fastmail, or any other mail service.
        </p>
      </section>

      <section id="use">
        <h2>Using the website</h2>
        <p>
          Use the website lawfully. Do not interfere with checkout, payment webhooks, or the
          download redirect, and do not attempt to reach non-public parts of the site. The
          website is hosted on Netlify and is offered as it is available.
        </p>
      </section>

      <section id="third-parties">
        <h2>Other services</h2>
        <p>
          Dodo Payments processes the charge. Resend delivers purchase email. GitHub hosts
          the source and the installers. Netlify hosts the website. AI features in the
          desktop app use the provider or local tool you select. Those services have their
          own terms. Details of what the app and the website send them are in the{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </section>

      <section id="disclaimer">
        <h2>Warranty and liability</h2>
        <p>
          The desktop application is provided under the warranty disclaimer and limitation of
          liability in the GPL, including sections 15 and 16 of GPL-3.0. The website is
          provided as available. Mail delivery depends on your providers and on the network
          between your computer and those providers.
        </p>
        <p>
          To the extent the law allows, Intray is not liable for indirect or consequential
          damages arising from use of the website, or for a provider’s failure to deliver
          mail.
        </p>
      </section>

      <section id="changes">
        <h2>Changes</h2>
        <p>
          Updates to these terms are posted on this page, and the date at the top changes
          with them. Continuing to use the website after an update means you accept the
          updated terms. The GPL terms for the software change only when that license file
          changes.
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
