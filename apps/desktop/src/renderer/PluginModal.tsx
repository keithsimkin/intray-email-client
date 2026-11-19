import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Blocks,
  Check,
  Loader2,
  Plug,
  RefreshCw,
  X,
} from "lucide-react";
import {
  PLUGIN_CATALOG,
  type NotionTarget,
  type PluginCatalogEntry,
  type PluginId,
  type PluginStatus,
} from "../shared/plugins";
import {
  bridgeConnectCalendar,
  bridgeConnectNotion,
  bridgeDisconnectPlugin,
  bridgeNotionSetTarget,
  bridgeNotionTargets,
  bridgeSetPluginEnabled,
} from "./mailApi";
import { CalendarBoard } from "./CalendarBoard";
import { GoogleCalendarBrand, pluginBrandIcons, SimpleBrandIcon } from "./BrandIcon";
import { pluginErrorFrom } from "../shared/pluginError";
import { MaskedAddress } from "./calendarMask";

const SUPPORT_EMAIL = "hello@intray.app";
const BUILD_DOCS =
  "https://github.com/keithsimkin/intray-email-client/blob/master/docs/PLUGINS.md";
const GITHUB_REQUEST =
  "https://github.com/keithsimkin/intray-email-client/issues/new?labels=plugin-request&title=Plugin%20request%3A%20";
const NOTION_INTEGRATIONS = "https://www.notion.so/my-integrations";

type PluginScreen = PluginId | "request" | "build";

function statusFor(statuses: PluginStatus[], id: PluginId): PluginStatus {
  return (
    statuses.find((status) => status.id === id) ?? {
      id,
      installed: false,
      connected: false,
      enabled: false,
      config: {},
      setup: { ready: true },
    }
  );
}

function catalogEntry(id: PluginId): PluginCatalogEntry {
  return PLUGIN_CATALOG.find((entry) => entry.id === id) ?? PLUGIN_CATALOG[0]!;
}

function navStatus(status: PluginStatus): string {
  const detail = status.config.targetTitle || status.config.workspace;
  if (!status.connected) return "Not connected";
  if (!status.enabled) return detail ? `Off · ${detail}` : "Off";
  return detail ? `On · ${detail}` : "On";
}

function CalendarNavStatus({ status }: { status: PluginStatus }) {
  if (!status.connected) return "Not connected";
  const email = status.config.email?.trim();
  const prefix = status.enabled ? "On" : "Off";
  if (!email) return prefix;
  return (
    <>
      {prefix} · <MaskedAddress email={email} />
    </>
  );
}

function PluginSwitch({
  on,
  label,
  disabled,
  onChange,
}: {
  on: boolean;
  label: string;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`toggle${on ? " on" : ""}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
    />
  );
}

function CommandSwitch({
  title,
  copy,
  on,
  label,
  disabled,
  onChange,
}: {
  title: string;
  copy: string;
  on: boolean;
  label: string;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="plugin-command-row">
      <div>
        <h3>{title}</h3>
        <p>{copy}</p>
      </div>
      <div className="plugin-switch-label">
        <span>{on ? "On" : "Off"}</span>
        <PluginSwitch
          on={on}
          label={label}
          disabled={disabled}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

function PluginGlyph({ id, size = 22 }: { id: PluginId; size?: number }) {
  if (id === "google-calendar") return <GoogleCalendarBrand size={size} />;
  return (
    <SimpleBrandIcon
      icon={pluginBrandIcons.notion}
      size={size}
      color="currentColor"
    />
  );
}

function PluginError({
  text,
  href,
}: {
  text: string | null;
  href: string | null;
}) {
  if (!text) return null;
  return (
    <p className="add-account-error" role="alert">
      {text}
      {href ? (
        <>
          {" "}
          <a href={href} target="_blank" rel="noreferrer">
            Enable Calendar API
          </a>
        </>
      ) : null}
    </p>
  );
}

export function PluginModal({
  statuses,
  onStatuses,
  onClose,
  onToast,
}: {
  statuses: PluginStatus[];
  onStatuses: (statuses: PluginStatus[]) => void;
  onClose: () => void;
  onToast: (text: string) => void;
}) {
  const titleId = "plugins-title";
  const notionInputRef = useRef<HTMLInputElement>(null);
  const [screen, setScreen] = useState<PluginScreen>("google-calendar");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorHref, setErrorHref] = useState<string | null>(null);
  const [notionToken, setNotionToken] = useState("");
  const [targets, setTargets] = useState<NotionTarget[] | null>(null);
  const [targetReload, setTargetReload] = useState(0);
  const [requestName, setRequestName] = useState("");
  const [requestDetail, setRequestDetail] = useState("");
  const [requestNotice, setRequestNotice] = useState<string | null>(null);

  const calendar = statusFor(statuses, "google-calendar");
  const notion = statusFor(statuses, "notion");
  const calendarEntry = catalogEntry("google-calendar");
  const notionEntry = catalogEntry("notion");

  const clearError = () => {
    setError(null);
    setErrorHref(null);
  };

  const showFailure = (cause: unknown, fallback: string) => {
    const notice = pluginErrorFrom(cause, fallback);
    setError(notice.text);
    setErrorHref(notice.href ?? null);
  };

  const openScreen = (next: PluginScreen) => {
    clearError();
    setScreen(next);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector("[data-calendar-dialog]")) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    if (screen !== "notion" || !notion.connected) return;
    let cancelled = false;
    setTargets(null);
    void bridgeNotionTargets()
      .then((list) => {
        if (!cancelled) {
          setTargets(list);
          setError(null);
          setErrorHref(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setTargets([]);
          showFailure(cause, "Could not load Notion destinations.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [screen, notion.connected, targetReload]);

  useEffect(() => {
    if (screen === "notion" && !notion.connected) {
      notionInputRef.current?.focus();
    }
  }, [screen, notion.connected]);

  const connectCalendar = async () => {
    clearError();
    setBusy("calendar-connect");
    try {
      onStatuses(await bridgeConnectCalendar());
      onToast("Google Calendar connected");
    } catch (cause) {
      showFailure(cause, "Could not connect Calendar.");
    } finally {
      setBusy(null);
    }
  };

  const connectNotion = async () => {
    if (!notionToken.trim()) {
      setErrorHref(null);
      setError("Paste your Notion integration token first.");
      notionInputRef.current?.focus();
      return;
    }
    clearError();
    setBusy("notion-connect");
    try {
      onStatuses(await bridgeConnectNotion(notionToken.trim()));
      setNotionToken("");
      onToast("Notion connected");
      setTargetReload((n) => n + 1);
    } catch (cause) {
      showFailure(cause, "Could not connect Notion.");
    } finally {
      setBusy(null);
    }
  };

  const chooseTarget = async (target: NotionTarget) => {
    clearError();
    setBusy(`notion-target:${target.id}`);
    try {
      onStatuses(await bridgeNotionSetTarget(target));
      onToast(`Saving email to ${target.title}`);
    } catch (cause) {
      showFailure(cause, "Could not save that Notion destination.");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (id: PluginId) => {
    clearError();
    setBusy(`disconnect:${id}`);
    try {
      onStatuses(await bridgeDisconnectPlugin(id));
      if (id === "notion") setTargets(null);
      onToast(
        id === "notion" ? "Logged out of Notion" : "Logged out of Google Calendar",
      );
    } catch (cause) {
      showFailure(cause, "Could not log out of that plugin.");
    } finally {
      setBusy(null);
    }
  };

  const setEnabled = async (id: PluginId, enabled: boolean) => {
    clearError();
    setBusy(`enabled:${id}`);
    try {
      onStatuses(await bridgeSetPluginEnabled(id, enabled));
    } catch (cause) {
      showFailure(cause, "Could not update that plugin.");
    } finally {
      setBusy(null);
    }
  };

  const requestBody = () => {
    const name = requestName.trim() || "A plugin";
    const detail = requestDetail.trim();
    return [
      `Plugin: ${name}`,
      "",
      detail || "What should it do with email?",
      "",
      `Intray version: ${window.intray ? "desktop" : "web preview"}`,
    ].join("\n");
  };

  const sendRequest = (target: "email" | "github") => {
    const subject = `Plugin request: ${requestName.trim() || "new plugin"}`;
    const body = requestBody();
    const href =
      target === "email"
        ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
        : `${GITHUB_REQUEST}${encodeURIComponent(requestName.trim() || "new plugin")}&body=${encodeURIComponent(body)}`;
    window.open(href, "_blank", "noopener,noreferrer");
    setRequestNotice(
      target === "email"
        ? "Opening a new message with the request…"
        : "Opening a prefilled GitHub issue…",
    );
  };

  const title =
    screen === "google-calendar"
      ? "Google Calendar"
      : screen === "notion"
        ? "Notion"
        : screen === "request"
          ? "Request a plugin"
          : "Build your own";

  return (
    <div className="modal-root" role="presentation" onClick={onClose}>
      <div
        className="modal plugin-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id={titleId}>Plugins</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close plugins"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="plugin-panel-body">
          <nav className="plugin-panel-nav" aria-label="Plugin sections">
            <button
              type="button"
              className={`plugin-nav-btn${screen === "google-calendar" ? " active" : ""}`}
              onClick={() => openScreen("google-calendar")}
            >
              <PluginGlyph id="google-calendar" />
              <span>
                <strong>{calendarEntry.name}</strong>
                <span>
                  <CalendarNavStatus status={calendar} />
                </span>
              </span>
            </button>
            <button
              type="button"
              className={`plugin-nav-btn${screen === "notion" ? " active" : ""}`}
              onClick={() => openScreen("notion")}
            >
              <PluginGlyph id="notion" />
              <span>
                <strong>{notionEntry.name}</strong>
                <span>{navStatus(notion)}</span>
              </span>
            </button>
            <button
              type="button"
              className={`plugin-nav-btn${screen === "request" ? " active" : ""}`}
              onClick={() => openScreen("request")}
            >
              <Plug size={18} strokeWidth={1.75} />
              <span>
                <strong>Request a plugin</strong>
                <span>Tell us the tool</span>
              </span>
            </button>
            <button
              type="button"
              className={`plugin-nav-btn${screen === "build" ? " active" : ""}`}
              onClick={() => openScreen("build")}
            >
              <Blocks size={18} strokeWidth={1.75} />
              <span>
                <strong>Build your own</strong>
                <span>Add one in the app</span>
              </span>
            </button>
            <p className="plugin-nav-note">
              Optional. Credentials stay on this device. Mail never passes
              through an Intray server.
            </p>
          </nav>

          <div className="plugin-panel-main">
            <header className="plugin-panel-intro">
              <h3>{title}</h3>
              <p>
                {screen === "google-calendar"
                  ? calendarEntry.description
                  : screen === "notion"
                    ? notionEntry.description
                    : screen === "request"
                      ? "Say which tool it is and what it should do with one email or thread."
                      : "A plugin is a module in the desktop app, not a download."}
              </p>
            </header>

            {screen === "google-calendar" && (
              <div className="plugin-controls plugin-controls-wide">
                <PluginError text={error} href={errorHref} />
                <section className="plugin-command">
                  <CommandSwitch
                    title="Show on open messages"
                    copy={
                      calendar.connected
                        ? calendar.enabled
                          ? "A meeting found in the email can be added under the subject. The toolbar button can add any email. Turning this off keeps you signed in."
                          : "Hidden from mail. Your Google account stays signed in until you log out."
                        : "Connect Google Calendar before this can be turned on."
                    }
                    on={calendar.enabled}
                    label={
                      calendar.enabled
                        ? "Turn Google Calendar off"
                        : "Turn Google Calendar on"
                    }
                    disabled={!calendar.connected || busy != null}
                    onChange={(next) => void setEnabled("google-calendar", next)}
                  />
                  <div className="plugin-command-row">
                    <div>
                      <h3>Google account</h3>
                      <p>
                        {calendar.connected ? (
                          <>
                            {calendar.config.email ? (
                              <MaskedAddress email={calendar.config.email} />
                            ) : (
                              "Signed in"
                            )}
                            {
                              ". This sign-in is only for Calendar. Logging out removes it from this device and does not log you out of Gmail."
                            }
                          </>
                        ) : calendar.setup.ready ? (
                          "Uses the same Google sign-in window as Gmail, with permission to read and create events on your primary calendar. You can revoke that in your Google Account at any time."
                        ) : (
                          calendar.setup.hint ??
                          "Google Calendar needs a Google OAuth client before it can connect."
                        )}
                      </p>
                    </div>
                    {calendar.connected ? (
                      <button
                        type="button"
                        className="plugin-secondary-btn"
                        disabled={busy != null}
                        onClick={() => void disconnect("google-calendar")}
                      >
                        {busy === "disconnect:google-calendar" ? (
                          <Loader2 size={14} className="spin" />
                        ) : null}
                        Log out
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="send add-account-primary"
                        disabled={!calendar.setup.ready || busy != null}
                        onClick={() => void connectCalendar()}
                      >
                        {busy === "calendar-connect" ? (
                          <Loader2 size={14} className="spin" />
                        ) : (
                          <PluginGlyph id="google-calendar" size={16} />
                        )}
                        Continue with Google
                      </button>
                    )}
                  </div>
                </section>

                <section className="plugin-control">
                  <h3>Primary calendar</h3>
                  <p>
                    {calendarEntry.permissionDetail} Every day of the week is
                    listed. Select an event to edit it, delete it, or reply
                    Accept, Maybe, or Decline. New event adds one to this
                    calendar. Guests are notified when you change or delete an
                    event they are on. Other calendars are not included in the
                    current Google permission.
                  </p>
                  {calendar.connected ? (
                    <>
                      {calendar.enabled ? null : (
                        <p className="cal-status">
                          Hidden on open messages while this is off. You can
                          still view and change the calendar here.
                        </p>
                      )}
                      <CalendarBoard
                        active
                        variant="panel"
                        accountEmail={calendar.config.email}
                      />
                    </>
                  ) : (
                    <p className="cal-status">
                      Connect Google Calendar to load this week.
                    </p>
                  )}
                </section>

                <section className="plugin-control">
                  <h3>What you control</h3>
                  <ul className="plugin-fact-list">
                    {calendarEntry.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                </section>
              </div>
            )}

            {screen === "notion" && (
              <div className="plugin-controls plugin-controls-wide">
                <PluginError text={error} href={errorHref} />
                <section className="plugin-command">
                  <CommandSwitch
                    title="Show on open messages"
                    copy={
                      notion.connected
                        ? notion.enabled
                          ? "The destination and a Save button are pinned under the subject. Turning this off keeps the token."
                          : "Hidden from mail. The integration token stays on this device until you log out."
                        : "Connect Notion before this can be turned on."
                    }
                    on={notion.enabled}
                    label={notion.enabled ? "Turn Notion off" : "Turn Notion on"}
                    disabled={!notion.connected || busy != null}
                    onChange={(next) => void setEnabled("notion", next)}
                  />
                  <div className="plugin-command-row">
                    <div>
                      <h3>Integration</h3>
                      <p>
                        {notion.connected
                          ? `${notion.config.workspace || "Notion"} is connected. The token stays on this device and is not shown again. Logging out deletes it.`
                          : "Paste an internal integration token. Share one database or page with that integration in Notion, or Intray cannot see a destination."}
                      </p>
                    </div>
                    {notion.connected ? (
                      <div className="plugin-control-actions">
                        <a
                          className="plugin-secondary-btn"
                          href={NOTION_INTEGRATIONS}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Manage
                          <ArrowUpRight size={13} />
                        </a>
                        <button
                          type="button"
                          className="plugin-secondary-btn"
                          disabled={busy != null}
                          onClick={() => void disconnect("notion")}
                        >
                          Log out
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {notion.connected ? null : (
                    <label className="add-field">
                      <span>Integration token</span>
                      <input
                        ref={notionInputRef}
                        type="password"
                        value={notionToken}
                        onChange={(event) => {
                          setNotionToken(event.target.value);
                          if (error) clearError();
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void connectNotion();
                          }
                        }}
                        placeholder="ntn_… or secret_…"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <span className="add-field-hint">
                        Create one at{" "}
                        <a
                          href={NOTION_INTEGRATIONS}
                          target="_blank"
                          rel="noreferrer"
                        >
                          notion.so/my-integrations
                        </a>
                        . The token never leaves this device.
                      </span>
                    </label>
                  )}
                  {notion.connected ? null : (
                    <button
                      type="button"
                      className="send add-account-primary"
                      disabled={busy != null}
                      onClick={() => void connectNotion()}
                    >
                      {busy === "notion-connect" ? (
                        <Loader2 size={14} className="spin" />
                      ) : (
                        <PluginGlyph id="notion" size={16} />
                      )}
                      Continue
                    </button>
                  )}
                </section>

                <section className="plugin-control">
                  <div className="plugin-control-head">
                    <div>
                      <h3>Where threads are saved</h3>
                      <p>
                        {notion.config.targetTitle
                          ? `Current destination: ${notion.config.targetTitle}${
                              notion.config.targetType
                                ? ` (${notion.config.targetType})`
                                : ""
                            }. Each save creates one page. The title is the subject. The body is the sender, the date, and the message text.`
                          : "Pick a database or page. Intray only lists destinations shared with the integration. Nothing is saved until you press Save on a message."}
                      </p>
                    </div>
                    {notion.connected ? (
                      <button
                        type="button"
                        className="plugin-secondary-btn"
                        disabled={targets === null || busy != null}
                        onClick={() => setTargetReload((n) => n + 1)}
                      >
                        {targets === null ? (
                          <Loader2 size={13} className="spin" />
                        ) : (
                          <RefreshCw size={13} strokeWidth={1.9} />
                        )}
                        Refresh
                      </button>
                    ) : null}
                  </div>
                  {notion.connected ? (
                    targets === null ? (
                      <p className="cal-status">Loading databases and pages…</p>
                    ) : targets.length === 0 ? (
                      <p className="cal-status">
                        No shared databases or pages yet. Share one with the
                        integration in Notion, then refresh.
                      </p>
                    ) : (
                      <div className="plugin-target-list">
                        {targets.map((target) => {
                          const selected = notion.config.targetId === target.id;
                          return (
                            <button
                              key={target.id}
                              type="button"
                              className={`plugin-target-row${selected ? " selected" : ""}`}
                              disabled={busy != null}
                              onClick={() => void chooseTarget(target)}
                            >
                              <span className="plugin-target-type">
                                {target.type === "database" ? "Database" : "Page"}
                              </span>
                              <span className="provider-card-text">
                                <strong>{target.title}</strong>
                                <span>
                                  {selected
                                    ? "Current destination"
                                    : "Save threads here"}
                                </span>
                              </span>
                              {selected ? (
                                <Check size={14} strokeWidth={2.2} />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    <p className="cal-status">
                      Connect Notion to choose a destination.
                    </p>
                  )}
                </section>

                <section className="plugin-control">
                  <h3>What gets written</h3>
                  <p>{notionEntry.permissionDetail}</p>
                  <ul className="plugin-fact-list">
                    {notionEntry.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                    <li>
                      In a database, only a title column and columns that
                      already match an email, a date, or a sender are filled.
                    </li>
                  </ul>
                </section>
              </div>
            )}

            {screen === "request" && (
              <form
                className="plugin-controls"
                onSubmit={(event) => {
                  event.preventDefault();
                  sendRequest("email");
                }}
              >
                <label className="add-field">
                  <span>Plugin or tool</span>
                  <input
                    value={requestName}
                    onChange={(event) => setRequestName(event.target.value)}
                    placeholder="Linear, Todoist, Slack…"
                    maxLength={120}
                  />
                </label>
                <label className="add-field">
                  <span>What should it do with email?</span>
                  <textarea
                    value={requestDetail}
                    onChange={(event) => setRequestDetail(event.target.value)}
                    placeholder="Create an issue from a thread, with the sender and the message text."
                    rows={6}
                    maxLength={1200}
                  />
                </label>
                {requestNotice ? (
                  <p className="cal-status">{requestNotice}</p>
                ) : null}
                <div className="plugin-control-actions">
                  <button
                    type="submit"
                    className="send add-account-primary"
                    disabled={!requestName.trim() && !requestDetail.trim()}
                  >
                    Email the request
                  </button>
                  <button
                    type="button"
                    className="plugin-secondary-btn"
                    disabled={!requestName.trim() && !requestDetail.trim()}
                    onClick={() => sendRequest("github")}
                  >
                    Open a GitHub issue
                    <ArrowUpRight size={13} />
                  </button>
                </div>
              </form>
            )}

            {screen === "build" && (
              <div className="plugin-controls">
                <section className="plugin-control">
                  <h3>How a plugin is added</h3>
                  <ol className="plugin-build-steps">
                    <li>Add an id to the catalog in the shared plugin list.</li>
                    <li>
                      Implement it next to Calendar and Notion in the desktop
                      app.
                    </li>
                    <li>
                      Keep credentials on the device. Turning a plugin off
                      leaves them. Logging out deletes them.
                    </li>
                    <li>
                      Show the plugin’s controls on this panel, and pin it on
                      the open message only while it is switched on.
                    </li>
                  </ol>
                  <button
                    type="button"
                    className="send add-account-primary"
                    onClick={() =>
                      window.open(BUILD_DOCS, "_blank", "noopener,noreferrer")
                    }
                  >
                    Read the contract
                    <ArrowUpRight size={14} />
                  </button>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
