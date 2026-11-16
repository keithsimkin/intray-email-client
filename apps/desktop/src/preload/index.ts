import { contextBridge, ipcRenderer } from "electron";
import type {
  AddImapAccountInput,
  AiCompleteRequest,
  AiCompleteResponse,
  AiProviderStatus,
  AiSecretId,
  BadgePayload,
  ComposeDraft,
  ContactDto,
  DesktopNotifyPayload,
  LabelDto,
  LaunchAtLoginState,
  MailListQuery,
  MailListResult,
  MailMutateAction,
  MailMutateOptions,
  McpStatus,
  MessageDto,
  AccountDto,
  QueuedSendResult,
  SyncStatus,
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

  notify: {
    show: (payload: DesktopNotifyPayload) =>
      ipcRenderer.invoke("notify:show", payload) as Promise<boolean>,
    setBadge: (payload: BadgePayload) =>
      ipcRenderer.invoke("notify:setBadge", payload) as Promise<boolean>,
    onOpen: (cb: (payload: { messageId: string }) => void) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        payload: { messageId: string },
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
    remove: (accountId: string) =>
      ipcRenderer.invoke("accounts:remove", accountId) as Promise<boolean>,
    oauthStatus: () =>
      ipcRenderer.invoke("accounts:oauthStatus") as Promise<{
        gmailConfigured: boolean;
      }>,
  },

  mail: {
    list: (query: MailListQuery) =>
      ipcRenderer.invoke("mail:list", query) as Promise<MailListResult>,
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
};

contextBridge.exposeInMainWorld("intray", api);

export type IntrayApi = typeof api;
