import { Resend } from "resend";
import { AppSumoLicense } from "@/emails/AppSumoLicense";
import { SupportOwnerAlert } from "@/emails/SupportOwnerAlert";
import { SupportThankYou } from "@/emails/SupportThankYou";

export function getResend() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export function resendFrom() {
  return process.env.RESEND_FROM?.trim() || "Intray <hello@intray.site>";
}

export function resendSupportTo() {
  return process.env.RESEND_SUPPORT_TO?.trim() || null;
}

function formatAmount(cents?: number | null, currency?: string | null) {
  if (typeof cents !== "number" || Number.isNaN(cents)) return null;
  const code = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

export async function sendSupportThankYou(opts: {
  to: string;
  name?: string | null;
  kind: "payment" | "subscription";
  eventId: string;
  amountCents?: number | null;
  currency?: string | null;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn("[resend] RESEND_API_KEY is not configured; skipping thank-you email");
    return { skipped: true as const };
  }

  const subject =
    opts.kind === "subscription"
      ? "Your Intray monthly license"
      : "Your Intray lifetime license";

  const { data, error } = await resend.emails.send(
    {
      from: resendFrom(),
      to: [opts.to],
      subject,
      react: SupportThankYou({
        name: opts.name,
        kind: opts.kind,
      }),
    },
    {
      idempotencyKey: `support-thanks/${opts.kind}/${opts.eventId}`,
    },
  );

  if (error) {
    console.error("[resend] failed to send thank-you", error);
    return { error };
  }

  const supportTo = resendSupportTo();
  if (supportTo) {
    const amountLabel = formatAmount(opts.amountCents, opts.currency);
    const alert = await resend.emails.send(
      {
        from: resendFrom(),
        to: [supportTo],
        subject:
          opts.kind === "subscription"
            ? `Intray: new monthly license ($10/mo)${amountLabel ? ` · ${amountLabel}` : ""}`
            : `Intray: new lifetime license ($75)${amountLabel ? ` · ${amountLabel}` : ""}`,
        react: SupportOwnerAlert({
          kind: opts.kind,
          customerName: opts.name,
          customerEmail: opts.to,
          amountLabel,
          referenceId: opts.eventId,
        }),
      },
      {
        idempotencyKey: `support-owner/${opts.kind}/${opts.eventId}`,
      },
    );
    if (alert.error) {
      console.error("[resend] failed to notify owner", alert.error);
    }
  }

  return { data };
}

export async function sendAppSumoLicense(opts: {
  to: string;
  license: string;
  licenseId: string;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn("[resend] RESEND_API_KEY is not configured; skipping license email");
    return { skipped: true as const };
  }

  const { data, error } = await resend.emails.send(
    {
      from: resendFrom(),
      to: [opts.to],
      subject: "Your Intray lifetime license",
      text: [
        "Your Intray lifetime license key:",
        "",
        opts.license,
        "",
        "Open Intray > Settings > License, paste the key.",
        "Download: https://intray.site/download",
      ].join("\n"),
      react: AppSumoLicense({ license: opts.license }),
    },
    {
      idempotencyKey: `appsumo-license/${opts.licenseId}`,
    },
  );

  if (error) {
    console.error("[resend] failed to send AppSumo license", error);
    return { error };
  }

  return { data };
}

export async function sendContactMessage(opts: {
  fromEmail: string;
  name?: string;
  message: string;
}) {
  const resend = getResend();
  const supportTo = resendSupportTo();
  if (!resend || !supportTo) {
    return { error: "Email is not configured" as const };
  }

  const safeMessage = opts.message
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  const { data, error } = await resend.emails.send({
    from: resendFrom(),
    to: [supportTo],
    replyTo: opts.fromEmail,
    subject: `Intray contact from ${opts.name?.trim() || opts.fromEmail}`,
    text: opts.message,
    html: `<p><strong>From:</strong> ${
      opts.name ? `${opts.name} &lt;${opts.fromEmail}&gt;` : opts.fromEmail
    }</p><pre style="white-space:pre-wrap;font-family:inherit">${safeMessage}</pre>`,
  });

  if (error) return { error };
  return { data };
}
