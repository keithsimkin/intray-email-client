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
  MailMutateAction,
  MailMutateOptions,
  McpStatus,
  MessageDto,
  AccountDto,
  AppUpdateStatus,
  QueuedSendResult,
  ReconnectAccountInput,
  SyncStatus,
  UpdateAccountInput,
} from "../shared/types";

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
    install: () =>
      ipcRenderer.invoke("app:installUpdate") as Promise<boolean>,
    openReleases: () =>
      ipcRenderer.invoke("app:openReleases") as Promise<boolean>,
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
    folderCounts: (accountId?: string | "all") =>
      ipcRenderer.invoke(
        "mail:folderCounts",
        accountId,
      ) as Promise<MailFolderCounts>,
    get: (id: string) =>
      ipcRenderer.invoke("mail:get", id) as Promise<MessageDto | null>,
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
  },

  labels: {
    list: () => ipcRenderer.invoke("labels:list") as Promise<LabelDto[]>,
    create: (input: { name: string; color: string }) =>
      ipcRenderer.invoke("labels:create", input) as Promise<LabelDto>,
  },

  contacts: {
    list: () => ipcRenderer.invoke("contacts:list") as Promise<ContactDto[]>,
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
