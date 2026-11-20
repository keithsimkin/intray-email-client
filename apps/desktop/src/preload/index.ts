import { contextBridge, ipcRenderer } from "electron";
import type {
  AccountReconnectInfo,
  AddAccountIdentityInput,
  AddImapAccountInput,
  AiCompleteRequest,
  AiCompleteResponse,
  AiModelList,
  AiProviderId,
  AiProviderStatus,
  AiSecretId,
  BadgePayload,
  ComposeDraft,
  ContactDto,
  DesktopNotifyPayload,
  LabelDto,
  LaunchAtLoginState,
  MailFolderCounts,
  MailListQuery,
  MailListResult,
  MailOlderResult,
  MailMutateAction,
  MailMutateOptions,
  McpStatus,
  AttachmentActionResult,
  AttachmentPreviewResult,
  MessageDto,
  AccountDto,
  AppUpdateStatus,
  QueuedSendResult,
  ReconnectAccountInput,
  SyncStatus,
  UpdateAccountInput,
} from "../shared/types";
import type { MailtoHandlerState } from "../shared/mailto";
import type {
  CalendarEventDto,
  CalendarEventInput,
  CalendarEventUpdate,
  CalendarRange,
  CalendarRsvp,
  NotionSaveInput,
  NotionSaveResult,
  NotionTarget,
  PluginId,
  PluginStatus,
} from "../shared/plugins";

const api = {
  getAppInfo: () =>
    ipcRenderer.invoke("app:info") as Promise<{
      name: string;
      version: string;
      stack: string;
    }>,

  getLaunchAtLogin: () =>
    ipcRenderer.invoke("app:getLaunchAtLogin") as Promise<LaunchAtLoginState>,
  openExternal: (url: string) =>
    ipcRenderer.invoke("app:openExternal", url) as Promise<boolean>,
  getMailtoHandler: () =>
    ipcRenderer.invoke("app:mailtoState") as Promise<MailtoHandlerState>,
  setMailtoHandler: (enabled: boolean) =>
    ipcRenderer.invoke("app:setMailtoHandler", enabled) as Promise<MailtoHandlerState>,
  claimMailto: () =>
    ipcRenderer.invoke("app:claimMailto") as Promise<string | null>,
  openDefaultApps: () =>
    ipcRenderer.invoke("app:openDefaultApps") as Promise<boolean>,
  onMailtoOpen: (cb: (url: string) => void) => {
    const listener = (_: Electron.IpcRendererEvent, url: string) => {
      if (typeof url === "string") cb(url);
    };
    ipcRenderer.on("mailto:open", listener);
    return () => ipcRenderer.removeListener("mailto:open", listener);
  },
  setLaunchAtLogin: (openAtLogin: boolean, openAsHidden = true) =>
    ipcRenderer.invoke(
      "app:setLaunchAtLogin",
      openAtLogin,
      openAsHidden,
    ) as Promise<LaunchAtLoginState>,
  setChromeTheme: (theme: "dark" | "light") =>
    ipcRenderer.invoke("app:setChromeTheme", theme) as Promise<boolean>,

  updates: {
    status: () =>
      ipcRenderer.invoke("app:updateStatus") as Promise<AppUpdateStatus>,
    check: () =>
      ipcRenderer.invoke("app:checkForUpdates") as Promise<AppUpdateStatus>,
    download: () =>
      ipcRenderer.invoke("app:downloadUpdate") as Promise<AppUpdateStatus>,
    install: () =>
      ipcRenderer.invoke("app:installUpdate") as Promise<boolean>,
    openReleases: () =>
      ipcRenderer.invoke("app:openReleases") as Promise<boolean>,
    onAsk: (cb: (action: "download") => void) => {
      const listener = (_: Electron.IpcRendererEvent, action: unknown) => {
        if (action === "download") cb("download");
      };
      ipcRenderer.on("app:updateAsk", listener);
      return () => ipcRenderer.removeListener("app:updateAsk", listener);
    },
    onStatus: (cb: (status: AppUpdateStatus) => void) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        payload: AppUpdateStatus,
      ) => cb(payload);
      ipcRenderer.on("app:updateStatus", listener);
      return () => ipcRenderer.removeListener("app:updateStatus", listener);
    },
  },

  notify: {
    show: (payload: DesktopNotifyPayload) =>
      ipcRenderer.invoke("notify:show", payload) as Promise<boolean>,
    setBadge: (payload: BadgePayload) =>
      ipcRenderer.invoke("notify:setBadge", payload) as Promise<boolean>,
    onOpen: (cb: (payload: { messageId: string; folderId?: string }) => void) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        payload: { messageId: string; folderId?: string },
      ) => cb(payload);
      ipcRenderer.on("notify:open", listener);
      return () => ipcRenderer.removeListener("notify:open", listener);
    },
  },

  accounts: {
    list: () => ipcRenderer.invoke("accounts:list") as Promise<AccountDto[]>,
    hasReal: () => ipcRenderer.invoke("accounts:hasReal") as Promise<boolean>,
    addGmail: () =>
      ipcRenderer.invoke("accounts:addGmail") as Promise<AccountDto>,
    addImap: (input: AddImapAccountInput) =>
      ipcRenderer.invoke("accounts:addImap", input) as Promise<AccountDto>,
    reconnectInfo: (accountId: string) =>
      ipcRenderer.invoke(
        "accounts:reconnectInfo",
        accountId,
      ) as Promise<AccountReconnectInfo>,
    reconnect: (input: ReconnectAccountInput) =>
      ipcRenderer.invoke("accounts:reconnect", input) as Promise<AccountDto>,
    remove: (accountId: string) =>
      ipcRenderer.invoke("accounts:remove", accountId) as Promise<boolean>,
    update: (input: UpdateAccountInput) =>
      ipcRenderer.invoke("accounts:update", input) as Promise<AccountDto>,
    chooseAvatar: (accountId: string) =>
      ipcRenderer.invoke(
        "accounts:chooseAvatar",
        accountId,
      ) as Promise<AccountDto>,
    clearAvatar: (accountId: string) =>
      ipcRenderer.invoke(
        "accounts:clearAvatar",
        accountId,
      ) as Promise<AccountDto>,
    addIdentity: (input: AddAccountIdentityInput) =>
      ipcRenderer.invoke(
        "accounts:addIdentity",
        input,
      ) as Promise<AccountDto>,
    removeIdentity: (accountId: string, identityId: string) =>
      ipcRenderer.invoke(
        "accounts:removeIdentity",
        accountId,
        identityId,
      ) as Promise<AccountDto>,
    oauthStatus: () =>
      ipcRenderer.invoke("accounts:oauthStatus") as Promise<{
        gmailConfigured: boolean;
      }>,
  },

  mail: {
    list: (query: MailListQuery) =>
      ipcRenderer.invoke("mail:list", query) as Promise<MailListResult>,
    loadOlder: (query: { accountId?: string | "all"; folder?: string }) =>
      ipcRenderer.invoke("mail:loadOlder", query) as Promise<MailOlderResult>,
    folderCounts: (accountId?: string | "all") =>
      ipcRenderer.invoke(
        "mail:folderCounts",
        accountId,
      ) as Promise<MailFolderCounts>,
    get: (id: string) =>
      ipcRenderer.invoke("mail:get", id) as Promise<MessageDto | null>,
    previewAttachment: (messageId: string, attachmentId: string) =>
      ipcRenderer.invoke(
        "mail:previewAttachment",
        messageId,
        attachmentId,
      ) as Promise<AttachmentPreviewResult>,
    saveAttachment: (messageId: string, attachmentId: string) =>
      ipcRenderer.invoke(
        "mail:saveAttachment",
        messageId,
        attachmentId,
      ) as Promise<AttachmentActionResult>,
    openAttachment: (messageId: string, attachmentId: string) =>
      ipcRenderer.invoke(
        "mail:openAttachment",
        messageId,
        attachmentId,
      ) as Promise<AttachmentActionResult>,
    mutate: (
      id: string,
      action: MailMutateAction,
      options?: MailMutateOptions,
    ) =>
      ipcRenderer.invoke(
        "mail:mutate",
        id,
        action,
        options,
      ) as Promise<MessageDto | null>,
    send: (draft: ComposeDraft) =>
      ipcRenderer.invoke("mail:send", draft) as Promise<MessageDto>,
    saveDraft: (draft: ComposeDraft) =>
      ipcRenderer.invoke("mail:saveDraft", draft) as Promise<MessageDto>,
    sendLater: (draft: ComposeDraft, delaySeconds: number) =>
      ipcRenderer.invoke(
        "mail:sendLater",
        draft,
        delaySeconds,
      ) as Promise<QueuedSendResult>,
    cancelSend: (queueId: string) =>
      ipcRenderer.invoke("mail:cancelSend", queueId) as Promise<boolean>,
    sync: (accountId?: string) =>
      ipcRenderer.invoke("mail:sync", accountId) as Promise<void>,
    onSendFlushed: (
      cb: (payload: { queueId: string; message: MessageDto }) => void,
    ) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        payload: { queueId: string; message: MessageDto },
      ) => cb(payload);
      ipcRenderer.on("mail:sendFlushed", listener);
      return () => ipcRenderer.removeListener("mail:sendFlushed", listener);
    },
    onUnsnoozed: (cb: (payload: { messageId: string }) => void) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        payload: { messageId: string },
      ) => cb(payload);
      ipcRenderer.on("mail:unsnoozed", listener);
      return () => ipcRenderer.removeListener("mail:unsnoozed", listener);
    },
    onUpdated: (cb: (payload: { message: MessageDto }) => void) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        payload: { message: MessageDto },
      ) => cb(payload);
      ipcRenderer.on("mail:updated", listener);
      return () => ipcRenderer.removeListener("mail:updated", listener);
    },
    onSearchReady: (cb: (payload: { q: string }) => void) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        payload: { q: string },
      ) => cb(payload);
      ipcRenderer.on("mail:search-ready", listener);
      return () => ipcRenderer.removeListener("mail:search-ready", listener);
    },
  },

  labels: {
    list: () => ipcRenderer.invoke("labels:list") as Promise<LabelDto[]>,
    create: (input: { name: string; color: string }) =>
      ipcRenderer.invoke("labels:create", input) as Promise<LabelDto>,
  },

  contacts: {
    list: () => ipcRenderer.invoke("contacts:list") as Promise<ContactDto[]>,
  },

  plugins: {
    list: () =>
      ipcRenderer.invoke("plugins:list") as Promise<PluginStatus[]>,
    connectCalendar: () =>
      ipcRenderer.invoke("plugins:connectCalendar") as Promise<PluginStatus[]>,
    connectNotion: (token: string) =>
      ipcRenderer.invoke(
        "plugins:connectNotion",
        token,
      ) as Promise<PluginStatus[]>,
    disconnect: (id: PluginId) =>
      ipcRenderer.invoke("plugins:disconnect", id) as Promise<PluginStatus[]>,
    setEnabled: (id: PluginId, enabled: boolean) =>
      ipcRenderer.invoke(
        "plugins:setEnabled",
        id,
        enabled,
      ) as Promise<PluginStatus[]>,
    calendarEvents: (range: CalendarRange) =>
      ipcRenderer.invoke(
        "plugins:calendarEvents",
        range,
      ) as Promise<CalendarEventDto[]>,
    calendarCreate: (input: CalendarEventInput) =>
      ipcRenderer.invoke(
        "plugins:calendarCreate",
        input,
      ) as Promise<CalendarEventDto>,
    calendarUpdate: (input: CalendarEventUpdate) =>
      ipcRenderer.invoke(
        "plugins:calendarUpdate",
        input,
      ) as Promise<CalendarEventDto>,
    calendarDelete: (id: string, notifyGuests: boolean) =>
      ipcRenderer.invoke(
        "plugins:calendarDelete",
        id,
        notifyGuests,
      ) as Promise<void>,
    calendarRespond: (id: string, response: CalendarRsvp) =>
      ipcRenderer.invoke(
        "plugins:calendarRespond",
        id,
        response,
      ) as Promise<CalendarEventDto>,
    notionTargets: () =>
      ipcRenderer.invoke("plugins:notionTargets") as Promise<NotionTarget[]>,
    notionSetTarget: (target: NotionTarget) =>
      ipcRenderer.invoke(
        "plugins:notionSetTarget",
        target,
      ) as Promise<PluginStatus[]>,
    notionSave: (input: NotionSaveInput) =>
      ipcRenderer.invoke(
        "plugins:notionSave",
        input,
      ) as Promise<NotionSaveResult>,
  },

  ai: {
    detect: (bridgePath?: string) =>
      ipcRenderer.invoke("ai:detect", bridgePath) as Promise<
        AiProviderStatus[]
      >,
    models: (provider: AiProviderId, bridgePath?: string) =>
      ipcRenderer.invoke("ai:models", provider, bridgePath) as Promise<
        AiModelList
      >,
    complete: (req: AiCompleteRequest) =>
      ipcRenderer.invoke("ai:complete", req) as Promise<AiCompleteResponse>,
    warm: (opts?: { bridgePath?: string; model?: string }) =>
      ipcRenderer.invoke(
        "ai:warm",
        opts?.bridgePath,
        opts?.model,
      ) as Promise<boolean>,
    secretsStatus: () =>
      ipcRenderer.invoke("ai:secretsStatus") as Promise<
        Record<AiSecretId, boolean>
      >,
    setSecret: (id: AiSecretId, value: string) =>
      ipcRenderer.invoke("ai:setSecret", id, value) as Promise<boolean>,
  },

  mcp: {
    status: () => ipcRenderer.invoke("mcp:status") as Promise<McpStatus>,
    start: () => ipcRenderer.invoke("mcp:start") as Promise<McpStatus>,
    stop: () => ipcRenderer.invoke("mcp:stop") as Promise<McpStatus>,
    rotateToken: () =>
      ipcRenderer.invoke("mcp:rotateToken") as Promise<McpStatus>,
  },

  sync: {
    listStatus: () =>
      ipcRenderer.invoke("sync:listStatus") as Promise<SyncStatus[]>,
    onProgress: (cb: (status: SyncStatus) => void) => {
      const listener = (_: Electron.IpcRendererEvent, status: SyncStatus) =>
        cb(status);
      ipcRenderer.on("sync:progress", listener);
      return () => ipcRenderer.removeListener("sync:progress", listener);
    },
  },

  avatars: {
    onUpdated: (cb: (payload: { email: string; avatarUrl: string }) => void) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        payload: { email: string; avatarUrl: string },
      ) => cb(payload);
      ipcRenderer.on("avatars:updated", listener);
      return () => ipcRenderer.removeListener("avatars:updated", listener);
    },
  },
};

contextBridge.exposeInMainWorld("intray", api);

export type IntrayApi = typeof api;
