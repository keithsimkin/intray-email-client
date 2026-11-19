import { useEffect, useState } from "react";
import { Check, Loader2, RefreshCw } from "lucide-react";
import {
  PLUGIN_CATALOG,
  type NotionTarget,
  type PluginId,
  type PluginStatus,
} from "../shared/plugins";
import { pluginErrorFrom } from "../shared/pluginError";
import {
  bridgeNotionSetTarget,
  bridgeNotionTargets,
} from "./mailApi";
import { pluginBrandIcons, SimpleBrandIcon } from "./BrandIcon";
import { CalendarWorkspace } from "./CalendarWorkspace";

function statusFor(statuses: PluginStatus[], id: PluginId): PluginStatus | undefined {
  return statuses.find((status) => status.id === id);
}

function NotionWorkspace({
  status,
  onStatuses,
  onOpenSettings,
  onToast,
}: {
  status: PluginStatus;
  onStatuses: (statuses: PluginStatus[]) => void;
  onOpenSettings: () => void;
  onToast: (text: string) => void;
}) {
  const [targets, setTargets] = useState<NotionTarget[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setTargets(null);
    void bridgeNotionTargets()
      .then((list) => {
        if (!cancelled) {
          setTargets(list);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setTargets([]);
          setError(pluginErrorFrom(cause, "Could not load Notion destinations.").text);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const choose = async (target: NotionTarget) => {
    setBusy(target.id);
    setError(null);
    try {
      onStatuses(await bridgeNotionSetTarget(target));
      onToast(`Saving email to ${target.title}`);
    } catch (cause) {
      setError(pluginErrorFrom(cause, "Could not save that Notion destination.").text);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="plugin-workspace">
      <header className="plugin-workspace-bar">
        <SimpleBrandIcon icon={pluginBrandIcons.notion} size={26} color="currentColor" />
        <div className="plugin-workspace-title">
          <h1>Notion</h1>
          <p>
            {status.config.workspace || "Notion"}
            {status.config.targetTitle
              ? ` · Saving threads to ${status.config.targetTitle}`
              : " · Choose where threads are saved"}
          </p>
        </div>
        <button type="button" className="plugin-text-btn" onClick={onOpenSettings}>
          Plugin settings
        </button>
      </header>
      <div className="notion-home">
        <section className="plugin-control">
          <div className="plugin-control-head">
            <div>
              <h3>
                {status.config.targetTitle
                  ? status.config.targetTitle
                  : "Where threads are saved"}
              </h3>
              <p>
                {status.config.targetTitle
                  ? `Each Save on an email creates one page in this ${
                      status.config.targetType === "page" ? "page" : "database"
                    }. The title is the subject. The body is the sender, the date, and the message.`
                  : "Pick a database or page shared with the integration. Nothing is saved until you press Save on a message."}
              </p>
            </div>
            <button
              type="button"
              className="plugin-secondary-btn"
              disabled={targets === null || busy !== null}
              onClick={() => setReload((value) => value + 1)}
            >
              {targets === null ? (
                <Loader2 size={13} className="spin" />
              ) : (
                <RefreshCw size={13} strokeWidth={1.9} />
              )}
              Refresh
            </button>
          </div>
          {error ? (
            <p className="add-account-error" role="alert">
              {error}
            </p>
          ) : null}
          {targets === null ? (
            <p className="cal-status">Loading databases and pages…</p>
          ) : targets.length === 0 ? (
            <p className="cal-status">
              No shared databases or pages yet. Share one with the integration
              in Notion, then refresh.
            </p>
          ) : (
            <div className="plugin-target-list">
              {targets.map((target) => {
                const selected = status.config.targetId === target.id;
                return (
                  <button
                    key={target.id}
                    type="button"
                    className={`plugin-target-row${selected ? " selected" : ""}`}
                    disabled={busy !== null}
                    onClick={() => void choose(target)}
                  >
                    <span className="plugin-target-type">
                      {target.type === "database" ? "Database" : "Page"}
                    </span>
                    <span className="provider-card-text">
                      <strong>{target.title}</strong>
                      <span>{selected ? "Current destination" : "Save threads here"}</span>
                    </span>
                    {selected ? <Check size={14} strokeWidth={2.2} /> : null}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** The plugin itself, opened from the Apps rail. Settings stay in PluginModal. */
export function PluginSurface({
  id,
  statuses,
  onStatuses,
  onOpenSettings,
  onToast,
}: {
  id: PluginId;
  statuses: PluginStatus[];
  onStatuses: (statuses: PluginStatus[]) => void;
  onOpenSettings: () => void;
  onToast: (text: string) => void;
}) {
  const status = statusFor(statuses, id);
  if (!status) return null;
  if (id === "google-calendar") {
    return (
      <CalendarWorkspace
        accountEmail={status.config.email}
        onOpenSettings={onOpenSettings}
      />
    );
  }
  if (id === "notion") {
    return (
      <NotionWorkspace
        status={status}
        onStatuses={onStatuses}
        onOpenSettings={onOpenSettings}
        onToast={onToast}
      />
    );
  }
  const entry = PLUGIN_CATALOG.find((item) => item.id === id);
  return (
    <div className="plugin-workspace">
      <header className="plugin-workspace-bar">
        <div className="plugin-workspace-title">
          <h1>{entry?.name ?? "Plugin"}</h1>
          <p>{entry?.description}</p>
        </div>
      </header>
    </div>
  );
}
