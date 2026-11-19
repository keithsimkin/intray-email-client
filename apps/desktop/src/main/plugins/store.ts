import {
  ensurePluginSchema,
  getDb,
} from "../db";

export type PluginRow = {
  id: string;
  enabled: number;
  config_json: string;
  updated_at: string;
};

export type PluginConfig = {
  email?: string;
  workspace?: string;
  targetId?: string;
  targetTitle?: string;
  targetType?: "database" | "page";
};

function all<T>(sql: string, params: unknown[] = []): T[] {
  return getDb().all(sql, params as never[]) as T[];
}

function get<T>(sql: string, params: unknown[] = []): T | undefined {
  return (getDb().get(sql, params as never[]) as T | null) ?? undefined;
}

function run(sql: string, params: unknown[] = []): void {
  getDb().run(sql, params as never[]);
}

export function getPluginRow(id: string): PluginRow | undefined {
  ensurePluginSchema();
  return get<PluginRow>("SELECT * FROM plugins WHERE id = ?", [id]);
}

export function listPluginRows(): PluginRow[] {
  ensurePluginSchema();
  return all<PluginRow>("SELECT * FROM plugins ORDER BY id ASC");
}

export function readPluginConfig(id: string): PluginConfig {
  const row = getPluginRow(id);
  if (!row?.config_json) return {};
  try {
    const parsed = JSON.parse(row.config_json) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as PluginConfig;
  } catch {
    return {};
  }
}

/**
 * Connected plugins with no row yet stay on, so an existing sign-in is not
 * hidden until the user flips the switch. A row with enabled=0 stays off.
 */
export function pluginSwitchOn(id: string, connected: boolean): boolean {
  if (!connected) return false;
  const row = getPluginRow(id);
  if (!row) return true;
  return row.enabled !== 0;
}

/**
 * Writes non-secret config. Leaves the on/off switch alone unless `enable`
 * is set, which connect uses so a fresh sign-in comes back on.
 */
export function savePluginConfig(
  id: string,
  config: PluginConfig,
  options?: { enable?: boolean },
): void {
  ensurePluginSchema();
  const existing = getPluginRow(id);
  const enabled = options?.enable
    ? 1
    : existing
      ? existing.enabled
        ? 1
        : 0
      : 1;
  run(
    `INSERT INTO plugins (id, enabled, config_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       enabled=excluded.enabled,
       config_json=excluded.config_json,
       updated_at=excluded.updated_at`,
    [id, enabled, JSON.stringify(config), new Date().toISOString()],
  );
}

/** On/off only. Credentials and config stay where they are. */
export function setPluginEnabledFlag(id: string, enabled: boolean): void {
  ensurePluginSchema();
  const existing = getPluginRow(id);
  const config =
    existing?.config_json && existing.config_json.length > 0
      ? existing.config_json
      : "{}";
  run(
    `INSERT INTO plugins (id, enabled, config_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       enabled=excluded.enabled,
       updated_at=excluded.updated_at`,
    [id, enabled ? 1 : 0, config, new Date().toISOString()],
  );
}

/** Log out: drop the saved labels and leave the plugin off. Secrets are separate. */
export function clearPluginAccount(id: string): void {
  ensurePluginSchema();
  run(
    `INSERT INTO plugins (id, enabled, config_json, updated_at)
     VALUES (?, 0, '{}', ?)
     ON CONFLICT(id) DO UPDATE SET
       enabled=0,
       config_json='{}',
       updated_at=excluded.updated_at`,
    [id, new Date().toISOString()],
  );
}
