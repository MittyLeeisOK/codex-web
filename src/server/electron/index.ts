import { ProxyAgent } from "undici";

type StubFunction = (...args: unknown[]) => unknown;
type StubListener = (...args: unknown[]) => void;
type StubWebContents = {
  id: number;
  mainFrame: {
    url: string;
  };
  getURL: () => string;
  isDestroyed: () => boolean;
  off: (event: string, listener: StubListener) => unknown;
  on: (event: string, listener: StubListener) => unknown;
  once: (event: string, listener: StubListener) => unknown;
  removeListener: (event: string, listener: StubListener) => unknown;
  send: (channel: string, ...args: unknown[]) => void;
};
type IpcMainEvent = {
  returnValue: unknown;
  processId: number;
  frameId: number;
  sender: StubWebContents;
  senderFrame: {
    url: string;
  };
  reply: (channel: string, ...args: unknown[]) => void;
};

type IpcMainBridgeState = {
  broadcastToRenderer?: (message: MainToRendererBridgeMessage) => void;
  handleRendererInvoke?: (
    channel: string,
    args: unknown[],
    sourceUrl?: string,
  ) => Promise<unknown>;
  handleRendererSend?: (
    channel: string,
    args: unknown[],
    sourceUrl?: string,
  ) => void;
};
type MainToRendererBridgeMessage =
  | {
      type: "ipc-main-event";
      channel: string;
      args: unknown[];
    }
  | {
      type: "open-browser-url";
      url: string;
    };
type FetchInitWithDispatcher = RequestInit & {
  dispatcher?: unknown;
};

function getIpcMainBridgeState(): IpcMainBridgeState {
  const globals = globalThis as typeof globalThis & {
    __codexElectronIpcBridge?: IpcMainBridgeState;
  };
  if (!globals.__codexElectronIpcBridge) {
    globals.__codexElectronIpcBridge = {};
  }
  return globals.__codexElectronIpcBridge;
}

function log(method: string, args: unknown[]): void {
  if (process.env.CODEX_WEB_ELECTRON_STUB_LOG !== "1") {
    return;
  }
  console.log(`[electron-main-stub] ${method}`, args);
}

const proxyAgents = new Map<string, ProxyAgent>();
const browserUserAgent =
  "Mozilla/5.0 AppleWebKit/537.36 Chrome/120 Safari/537.36";
const electronOnlyChatGptHeaderNames = new Set([
  "x-openai-attach-desktop-surface",
  "x-openai-attach-devicecheck-token",
  "x-openai-attach-integrity-state",
]);

function isChatGptRequest(input: string | URL): boolean {
  try {
    return new URL(String(input)).hostname === "chatgpt.com";
  } catch {
    return false;
  }
}

function resolveFetchInit(input: string | URL, init?: RequestInit): RequestInit {
  const resolvedInit: RequestInit = { ...init };
  if (isChatGptRequest(input)) {
    const headers = new Headers(init?.headers);
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }
    headers.set("User-Agent", browserUserAgent);
    resolvedInit.headers = headers;
  }
  return resolvedInit;
}

function sanitizeRendererIpcArgsForHeadlessElectron(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      value[index] = sanitizeRendererIpcArgsForHeadlessElectron(value[index]);
    }
    return value;
  }

  if (value == null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Headers) {
    for (const headerName of electronOnlyChatGptHeaderNames) {
      value.delete(headerName);
    }
    return value;
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (electronOnlyChatGptHeaderNames.has(key.toLowerCase())) {
      delete record[key];
      continue;
    }
    record[key] = sanitizeRendererIpcArgsForHeadlessElectron(record[key]);
  }

  return value;
}

function getProxyUrlForRequest(input: string | URL): string | undefined {
  let url: URL;
  try {
    url = input instanceof URL ? input : new URL(input);
  } catch {
    return undefined;
  }

  if (shouldBypassProxy(url.hostname)) {
    return undefined;
  }

  if (url.protocol === "https:") {
    return (
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.ALL_PROXY ||
      process.env.all_proxy
    );
  }

  if (url.protocol === "http:") {
    return (
      process.env.HTTP_PROXY ||
      process.env.http_proxy ||
      process.env.ALL_PROXY ||
      process.env.all_proxy
    );
  }

  return undefined;
}

function shouldBypassProxy(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();
  const noProxy = process.env.NO_PROXY || process.env.no_proxy || "";

  for (const rawEntry of noProxy.split(",")) {
    const entry = rawEntry.trim().toLowerCase();
    if (!entry) {
      continue;
    }
    if (entry === "*") {
      return true;
    }
    if (entry === normalizedHostname) {
      return true;
    }
    if (entry.startsWith(".")) {
      const suffix = entry.slice(1);
      if (
        normalizedHostname === suffix ||
        normalizedHostname.endsWith(`.${suffix}`)
      ) {
        return true;
      }
    }
    if (
      entry.startsWith("*.") &&
      normalizedHostname.endsWith(entry.slice(1))
    ) {
      return true;
    }
  }

  return false;
}

function getProxyAgent(proxyUrl: string): ProxyAgent {
  let agent = proxyAgents.get(proxyUrl);
  if (!agent) {
    agent = new ProxyAgent(proxyUrl);
    proxyAgents.set(proxyUrl, agent);
  }
  return agent;
}

function createDeepStub(pathLabel: string): StubFunction {
  const fn: StubFunction = (...args: unknown[]) => {
    log(`${pathLabel}()`, args);
    return undefined;
  };

  return new Proxy(fn, {
    apply(_target, _thisArg, argArray) {
      log(`${pathLabel}()`, argArray);
      return undefined;
    },
    construct(_target, argArray) {
      log(`new ${pathLabel}()`, argArray);
      return {};
    },
    get(_target, prop) {
      if (prop === "then") {
        return undefined;
      }

      if (prop === Symbol.toPrimitive) {
        return () => pathLabel;
      }

      return createDeepStub(`${pathLabel}.${String(prop)}`);
    },
  });
}

function createEmitterStub(label: string): {
  addListener: (event: string, listener: StubListener) => unknown;
  emit: (event: string, ...args: unknown[]) => boolean;
  off: (event: string, listener: StubListener) => unknown;
  on: (event: string, listener: StubListener) => unknown;
  once: (event: string, listener: StubListener) => unknown;
  removeListener: (event: string, listener: StubListener) => unknown;
} {
  const listeners = new Map<string, Set<StubListener>>();

  const api = {
    on(event: string, listener: StubListener): unknown {
      log(`${label}.on`, [event, listener]);
      const eventListeners = listeners.get(event) ?? new Set<StubListener>();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
      return api;
    },
    once(event: string, listener: StubListener): unknown {
      log(`${label}.once`, [event, listener]);
      const wrapped: StubListener = (...args: unknown[]) => {
        api.removeListener(event, wrapped);
        listener(...args);
      };
      return api.on(event, wrapped);
    },
    addListener(event: string, listener: StubListener): unknown {
      log(`${label}.addListener`, [event, listener]);
      return api.on(event, listener);
    },
    removeListener(event: string, listener: StubListener): unknown {
      log(`${label}.removeListener`, [event, listener]);
      listeners.get(event)?.delete(listener);
      return api;
    },
    off(event: string, listener: StubListener): unknown {
      log(`${label}.off`, [event, listener]);
      return api.removeListener(event, listener);
    },
    emit(event: string, ...args: unknown[]): boolean {
      log(`${label}.emit`, [event, ...args]);
      for (const listener of listeners.get(event) ?? []) {
        listener(...args);
      }
      return true;
    },
  };

  return api;
}

function createMessagePortStub(label: string): {
  on: (event: string, listener: StubListener) => unknown;
  postMessage: (...args: unknown[]) => void;
  start: () => void;
} {
  const emitter = createEmitterStub(label);
  return {
    on: emitter.on,
    postMessage(...args: unknown[]): void {
      log(`${label}.postMessage`, args);
    },
    start(): void {
      log(`${label}.start`, []);
    },
  };
}

const rendererUrl = "http://localhost:5175/";
const rendererMainFrame = {
  url: rendererUrl,
};
const rendererWebContentsEmitter = createEmitterStub("ipcMainEvent.sender");
const rendererWebContents: StubWebContents = {
  id: 1001,
  mainFrame: rendererMainFrame,
  getURL: () => rendererMainFrame.url,
  isDestroyed: () => false,
  off: rendererWebContentsEmitter.off,
  on: rendererWebContentsEmitter.on,
  once: rendererWebContentsEmitter.once,
  removeListener: rendererWebContentsEmitter.removeListener,
  send: (channel: string, ...args: unknown[]): void => {
    getIpcMainBridgeState().broadcastToRenderer?.({
      type: "ipc-main-event",
      channel,
      args,
    });
  },
};

function createIpcMainEvent(): IpcMainEvent {
  const event: IpcMainEvent = {
    returnValue: undefined,
    processId: 1,
    frameId: 1,
    sender: rendererWebContents,
    senderFrame: rendererMainFrame,
    reply: (channel: string, ...args: unknown[]): void => {
      getIpcMainBridgeState().broadcastToRenderer?.({
        type: "ipc-main-event",
        channel,
        args,
      });
    },
  };

  return event;
}

function createIpcMainStub(): {
  handle: (
    channel: string,
    handler: (event: unknown, ...args: unknown[]) => unknown,
  ) => void;
  off: (event: string, listener: StubListener) => unknown;
  on: (event: string, listener: StubListener) => unknown;
  removeHandler: (channel: string) => void;
} {
  const emitter = createEmitterStub("ipcMain");
  const handlers = new Map<
    string,
    (event: unknown, ...args: unknown[]) => unknown
  >();
  const bridgeState = getIpcMainBridgeState();

  bridgeState.handleRendererInvoke = async (
    channel: string,
    args: unknown[],
  ): Promise<unknown> => {
    const handler = handlers.get(channel);
    if (!handler) {
      throw new Error(`[electron-main-stub] No ipcMain.handle for ${channel}`);
    }
    const event = createIpcMainEvent();
    sanitizeRendererIpcArgsForHeadlessElectron(args);
    return await Promise.resolve(handler(event, ...args));
  };

  bridgeState.handleRendererSend = (
    channel: string,
    args: unknown[],
    sourceUrl?: string,
  ): void => {
    const event = createIpcMainEvent();
    sanitizeRendererIpcArgsForHeadlessElectron(args);
    emitter.emit(channel, event, ...args);
  };

  return {
    on: emitter.on,
    off: emitter.off,
    handle(
      channel: string,
      handler: (event: unknown, ...args: unknown[]) => unknown,
    ): void {
      log("ipcMain.handle", [channel, handler]);
      handlers.set(channel, handler);
    },
    removeHandler(channel: string): void {
      log("ipcMain.removeHandler", [channel]);
      handlers.delete(channel);
    },
  };
}

let appReady = false;
const commandLineSwitches = new Map<string, string>();
const commandLineArguments: string[] = [];

const appBase = {
  ...createEmitterStub("app"),
  name: "Codex",
  isPackaged: false,
  getName(): string {
    log("app.getName", []);
    return "Codex";
  },
  getVersion(): string {
    return globalThis.__CODEX_SHIM_VALUES__.version;
  },
  getLocale(): string {
    log("app.getLocale", []);
    return "en-US";
  },
  getSystemLocale(): string {
    log("app.getSystemLocale", []);
    return "en-US";
  },
  getPreferredSystemLanguages(): string[] {
    log("app.getPreferredSystemLanguages", []);
    return ["en-US"];
  },
  getPath(name: string): string {
    log("app.getPath", [name]);
    return process.cwd();
  },
  getAppMetrics(): unknown[] {
    log("app.getAppMetrics", []);
    return [];
  },
  getAppPath(): string {
    log("app.getAppPath", []);
    return process.cwd();
  },
  async getGPUInfo(infoLevel: string): Promise<{ gpuDevice: unknown[] }> {
    log("app.getGPUInfo", [infoLevel]);
    return { gpuDevice: [] };
  },
  setName(name: string): void {
    log("app.setName", [name]);
  },
  setPath(name: string, value: string): void {
    log("app.setPath", [name, value]);
  },
  setAppUserModelId(value: string): void {
    log("app.setAppUserModelId", [value]);
  },
  requestSingleInstanceLock(): boolean {
    log("app.requestSingleInstanceLock", []);
    return true;
  },
  isReady(): boolean {
    log("app.isReady", []);
    return appReady;
  },
  whenReady(): Promise<void> {
    log("app.whenReady", []);
    appReady = true;
    return Promise.resolve();
  },
  commandLine: {
    appendSwitch(name: string, value?: string): void {
      log("app.commandLine.appendSwitch", [name, value]);
      commandLineSwitches.set(name, value ?? "");
    },
    appendArgument(value: string): void {
      log("app.commandLine.appendArgument", [value]);
      commandLineArguments.push(value);
    },
    getSwitchValue(name: string): string {
      log("app.commandLine.getSwitchValue", [name]);
      return commandLineSwitches.get(name) ?? "";
    },
    hasSwitch(name: string): boolean {
      log("app.commandLine.hasSwitch", [name]);
      return commandLineSwitches.has(name);
    },
    removeSwitch(name: string): void {
      log("app.commandLine.removeSwitch", [name]);
      commandLineSwitches.delete(name);
    },
  },
  on(event: string, listener: (...args: unknown[]) => void): unknown {
    log("app.on", [event, listener]);
    return app;
  },
  once(event: string, listener: (...args: unknown[]) => void): unknown {
    log("app.once", [event, listener]);
    return app;
  },
  quit(): void {
    log("app.quit", []);
  },
  exit(code?: number): void {
    log("app.exit", [code]);
  },
};

const app = new Proxy(appBase as Record<string, unknown>, {
  get(target, prop) {
    if (prop in target) {
      return target[prop as keyof typeof target];
    }

    return createDeepStub(`app.${String(prop)}`);
  },
}) as typeof appBase;

class BrowserWindow {
  static nextId = 1;
  static allWindows: BrowserWindow[] = [];
  static focusedWindow: BrowserWindow | null = null;
  static webBridgeWindowId: number | null = null;
  id: number;
  private destroyed = false;
  private title = "Codex";
  private bounds = { x: 0, y: 0, width: 1280, height: 820 };
  webContents: Record<string, unknown>;
  private readonly emitter: ReturnType<typeof createEmitterStub>;
  private readonly isPrimaryWindow: boolean;

  constructor(...args: unknown[]) {
    log("new BrowserWindow", args);
    this.id = BrowserWindow.nextId++;
    this.isPrimaryWindow = BrowserWindow.webBridgeWindowId == null;
    BrowserWindow.webBridgeWindowId ??= this.id;
    this.emitter = createEmitterStub(`BrowserWindow#${this.id}`);

    const webContentsEmitter = createEmitterStub(
      `BrowserWindow#${this.id}.webContents`,
    );
    this.webContents = new Proxy(
      {
        ...webContentsEmitter,
        id: this.id * 1000 + 1,
        mainFrame: {
          url: "",
        },
        getURL: (): string => {
          log(`BrowserWindow#${this.id}.webContents.getURL`, []);
          return String(
            (this.webContents.mainFrame as { url?: string } | undefined)
              ?.url ?? "",
          );
        },
        isDestroyed: (): boolean => this.destroyed,
        loadURL: async (url: string): Promise<void> => {
          log(`BrowserWindow#${this.id}.webContents.loadURL`, [url]);
          (this.webContents.mainFrame as { url: string }).url = url;
          if (!this.isPrimaryWindow) {
            getIpcMainBridgeState().broadcastToRenderer?.({
              type: "open-browser-url",
              url,
            });
          }
        },
        loadFile: async (...loadFileArgs: unknown[]): Promise<void> => {
          log(`BrowserWindow#${this.id}.webContents.loadFile`, loadFileArgs);
        },
        openDevTools: (...openDevToolsArgs: unknown[]): void => {
          log(
            `BrowserWindow#${this.id}.webContents.openDevTools`,
            openDevToolsArgs,
          );
        },
        send: (...sendArgs: unknown[]): void => {
          log(`BrowserWindow#${this.id}.webContents.send`, sendArgs);
          if (sendArgs.length === 0 || typeof sendArgs[0] !== "string") {
            return;
          }
          if (this.id !== BrowserWindow.webBridgeWindowId) {
            return;
          }
          const [channel, ...args] = sendArgs as [string, ...unknown[]];
          getIpcMainBridgeState().broadcastToRenderer?.({
            type: "ipc-main-event",
            channel,
            args,
          });
        },
      } as Record<string, unknown>,
      {
        get: (target, prop) => {
          if (prop in target) {
            return target[prop as keyof typeof target];
          }
          return createDeepStub(
            `BrowserWindow#${this.id}.webContents.${String(prop)}`,
          );
        },
      },
    );

    if (this.isPrimaryWindow) {
      BrowserWindow.allWindows.push(this);
      BrowserWindow.focusedWindow = this;
    }
    return new Proxy(this, {
      get: (target, prop) => {
        if (prop in target) {
          return target[prop as keyof typeof target];
        }
        return createDeepStub(`BrowserWindow#${target.id}.${String(prop)}`);
      },
    });
  }

  static getAllWindows(): BrowserWindow[] {
    log("BrowserWindow.getAllWindows", []);
    return BrowserWindow.allWindows.filter((window) => !window.destroyed);
  }

  static getFocusedWindow(): BrowserWindow | null {
    log("BrowserWindow.getFocusedWindow", []);
    if (
      BrowserWindow.focusedWindow &&
      !BrowserWindow.focusedWindow.destroyed
    ) {
      return BrowserWindow.focusedWindow;
    }
    return BrowserWindow.getAllWindows()[0] ?? null;
  }

  static fromId(id: number): BrowserWindow | null {
    log("BrowserWindow.fromId", [id]);
    return (
      BrowserWindow.getAllWindows().find((window) => window.id === id) ?? null
    );
  }

  static fromWebContents(
    webContents: { id?: unknown } | null | undefined,
  ): BrowserWindow | null {
    log("BrowserWindow.fromWebContents", [webContents]);
    if (!webContents) {
      return null;
    }

    return (
      BrowserWindow.getAllWindows().find(
        (window) =>
          window.webContents === webContents ||
          window.webContents.id === webContents.id,
      ) ?? null
    );
  }

  on(event: string, listener: StubListener): unknown {
    return this.emitter.on(event, listener);
  }

  once(event: string, listener: StubListener): unknown {
    return this.emitter.once(event, listener);
  }

  off(event: string, listener: StubListener): unknown {
    return this.emitter.off(event, listener);
  }

  removeListener(event: string, listener: StubListener): unknown {
    return this.emitter.removeListener(event, listener);
  }

  close(): void {
    log(`BrowserWindow#${this.id}.close`, []);
    this.emitter.emit("close", {
      preventDefault: () => undefined,
    });
    this.destroy();
  }

  destroy(): void {
    log(`BrowserWindow#${this.id}.destroy`, []);
    this.destroyed = true;
    if (BrowserWindow.focusedWindow === this) {
      BrowserWindow.focusedWindow = null;
    }
    this.emitter.emit("closed");
  }

  isDestroyed(): boolean {
    log(`BrowserWindow#${this.id}.isDestroyed`, []);
    return this.destroyed;
  }

  isFocused(): boolean {
    log(`BrowserWindow#${this.id}.isFocused`, []);
    return BrowserWindow.focusedWindow === this && !this.destroyed;
  }

  removeMenu(): void {
    log(`BrowserWindow#${this.id}.removeMenu`, []);
  }

  getTitle(): string {
    log(`BrowserWindow#${this.id}.getTitle`, []);
    return this.title;
  }

  setTitle(nextTitle: string): void {
    log(`BrowserWindow#${this.id}.setTitle`, [nextTitle]);
    this.title = nextTitle;
  }

  getBounds(): { height: number; width: number; x: number; y: number } {
    log(`BrowserWindow#${this.id}.getBounds`, []);
    return { ...this.bounds };
  }

  setBounds(nextBounds: {
    height?: number;
    width?: number;
    x?: number;
    y?: number;
  }): void {
    log(`BrowserWindow#${this.id}.setBounds`, [nextBounds]);
    this.bounds = {
      x: nextBounds.x ?? this.bounds.x,
      y: nextBounds.y ?? this.bounds.y,
      width: nextBounds.width ?? this.bounds.width,
      height: nextBounds.height ?? this.bounds.height,
    };
  }

  show(): void {
    log(`BrowserWindow#${this.id}.show`, []);
  }

  hide(): void {
    log(`BrowserWindow#${this.id}.hide`, []);
  }

  focus(): void {
    log(`BrowserWindow#${this.id}.focus`, []);
    if (!this.isPrimaryWindow) {
      return;
    }
    BrowserWindow.focusedWindow = this;
    this.emitter.emit("focus");
  }
}

class WebContentsView {
  constructor(...args: unknown[]) {
    log("new WebContentsView", args);
  }
}

class Menu {
  static applicationMenu: Menu | null = null;
  items: MenuItem[] = [];

  constructor(items: MenuItem[] = []) {
    this.items = items;
  }

  static buildFromTemplate(template: unknown[]): Menu {
    log("Menu.buildFromTemplate", [template]);
    const items = template.map((entry) => new MenuItem(entry));
    return new Menu(items);
  }

  static setApplicationMenu(menu: Menu | null): void {
    log("Menu.setApplicationMenu", [menu]);
    Menu.applicationMenu = menu;
  }

  static getApplicationMenu(): Menu | null {
    log("Menu.getApplicationMenu", []);
    return Menu.applicationMenu;
  }

  getMenuItemById(id: string): MenuItem | undefined {
    log("Menu.getMenuItemById", [id]);
    const queue = [...this.items];
    while (queue.length > 0) {
      const candidate = queue.shift();
      if (!candidate) {
        continue;
      }
      if (candidate.id === id) {
        return candidate;
      }
      if (candidate.submenu) {
        queue.push(...candidate.submenu.items);
      }
    }
    return undefined;
  }

  append(item: MenuItem): void {
    log("Menu.append", [item]);
    this.items.push(item);
  }

  insert(pos: number, item: MenuItem): void {
    log("Menu.insert", [pos, item]);
    const index = Math.max(0, Math.min(pos, this.items.length));
    this.items.splice(index, 0, item);
  }

  popup(...args: unknown[]): void {
    log("Menu.popup", args);
  }
}

class MenuItem {
  checked?: boolean;
  click?: (...args: unknown[]) => unknown;
  enabled?: boolean;
  id?: string;
  label?: string;
  role?: string;
  submenu?: Menu;
  type?: string;
  visible?: boolean;

  constructor(...args: unknown[]) {
    log("new MenuItem", args);
    const [options] = args as [Record<string, unknown>?];
    if (!options || typeof options !== "object") {
      return;
    }
    this.checked =
      typeof options.checked === "boolean" ? options.checked : undefined;
    this.click =
      typeof options.click === "function"
        ? (options.click as (...args: unknown[]) => unknown)
        : undefined;
    this.enabled =
      typeof options.enabled === "boolean" ? options.enabled : undefined;
    this.id = typeof options.id === "string" ? options.id : undefined;
    this.label = typeof options.label === "string" ? options.label : undefined;
    this.role = typeof options.role === "string" ? options.role : undefined;
    this.type = typeof options.type === "string" ? options.type : undefined;
    this.visible =
      typeof options.visible === "boolean" ? options.visible : undefined;

    const submenu = options.submenu;
    if (Array.isArray(submenu)) {
      this.submenu = Menu.buildFromTemplate(submenu);
      return;
    }
    if (submenu instanceof Menu) {
      this.submenu = submenu;
    }
  }
}

class Tray {
  constructor(...args: unknown[]) {
    log("new Tray", args);
  }
}

class Notification {
  constructor(...args: unknown[]) {
    log("new Notification", args);
  }

  show(): void {
    log("Notification.show", []);
  }
}

const dialog = {
  async showMessageBox(...args: unknown[]): Promise<{ response: number }> {
    log("dialog.showMessageBox", args);
    return { response: 0 };
  },
};

const crashReporter = {
  start(...args: unknown[]): void {
    log("crashReporter.start", args);
  },
};

const net = {
  async fetch(input: string | URL, init?: RequestInit): Promise<Response> {
    // log("net.fetch", [input, init]);
    if (typeof globalThis.fetch === "function") {
      const initWithHeaders = resolveFetchInit(input, init);
      const proxyUrl = getProxyUrlForRequest(input);
      const resolvedInit: FetchInitWithDispatcher = proxyUrl
        ? { ...initWithHeaders, dispatcher: getProxyAgent(proxyUrl) }
        : initWithHeaders;
      return globalThis.fetch(input as URL | RequestInfo, resolvedInit);
    }
    return new Response("", { status: 204 });
  },
  request(...args: unknown[]): {
    getHeader: (name: string) => string | undefined;
    once: (event: string, listener: StubListener) => unknown;
    setHeader: (name: string, value: string) => void;
  } {
    // log("net.request", args);
    const headers = new Map<string, string>();
    const request = {
      setHeader(name: string, value: string): void {
        // log("net.request.setHeader", [name, value]);
        headers.set(name.toLowerCase(), value);
      },
      getHeader(name: string): string | undefined {
        // log("net.request.getHeader", [name]);
        return headers.get(name.toLowerCase());
      },
      once(event: string, listener: StubListener): unknown {
        // log("net.request.once", [event, listener]);
        return request;
      },
    };
    return request;
  },
};

const autoUpdater = createEmitterStub("autoUpdater");
const ipcMain = createIpcMainStub();
const nativeTheme = {
  ...createEmitterStub("nativeTheme"),
  shouldUseDarkColors: false,
  shouldUseHighContrastColors: false,
  shouldUseInvertedColorScheme: false,
  themeSource: "system",
};
const nativeImage = {
  createEmpty(): { isEmpty: () => boolean } {
    log("nativeImage.createEmpty", []);
    return {
      isEmpty: () => true,
    };
  },
  createFromPath(imagePath: string): { isEmpty: () => boolean } {
    log("nativeImage.createFromPath", [imagePath]);
    return {
      isEmpty: () => !imagePath,
    };
  },
};
const powerMonitor = createEmitterStub("powerMonitor");
const screen = {
  ...createEmitterStub("screen"),
  getAllDisplays(): Array<{
    id: number;
    scaleFactor: number;
    size: { height: number; width: number };
    workArea: { height: number; width: number; x: number; y: number };
    workAreaSize: { height: number; width: number };
    bounds: { height: number; width: number; x: number; y: number };
  }> {
    log("screen.getAllDisplays", []);
    return [this.getPrimaryDisplay()];
  },
  getDisplayMatching(): {
    id: number;
    scaleFactor: number;
    size: { height: number; width: number };
    workArea: { height: number; width: number; x: number; y: number };
    workAreaSize: { height: number; width: number };
    bounds: { height: number; width: number; x: number; y: number };
  } {
    log("screen.getDisplayMatching", []);
    return this.getPrimaryDisplay();
  },
  getPrimaryDisplay(): {
    id: number;
    scaleFactor: number;
    size: { height: number; width: number };
    workArea: { height: number; width: number; x: number; y: number };
    workAreaSize: { height: number; width: number };
    bounds: { height: number; width: number; x: number; y: number };
  } {
    log("screen.getPrimaryDisplay", []);
    return {
      id: 1,
      scaleFactor: 2,
      size: { width: 1440, height: 900 },
      workArea: { x: 0, y: 0, width: 1440, height: 900 },
      workAreaSize: { width: 1440, height: 900 },
      bounds: { x: 0, y: 0, width: 1440, height: 900 },
    };
  },
};
const protocol = {
  registerSchemesAsPrivileged(...args: unknown[]): void {
    log("protocol.registerSchemesAsPrivileged", args);
  },
  handle(...args: unknown[]): void {
    log("protocol.handle", args);
  },
  registerStringProtocol(...args: unknown[]): void {
    log("protocol.registerStringProtocol", args);
  },
};
function createSessionStub(label: string): {
  cookies: {
    flushStore: () => Promise<void>;
    get: (...args: unknown[]) => Promise<unknown[]>;
    off: (event: string, listener: StubListener) => unknown;
    on: (event: string, listener: StubListener) => unknown;
    once: (event: string, listener: StubListener) => unknown;
    remove: (...args: unknown[]) => Promise<void>;
    removeListener: (event: string, listener: StubListener) => unknown;
    set: (...args: unknown[]) => Promise<void>;
  };
  getUserAgent: () => string;
  loadExtension: (extensionPath: string) => Promise<{
    id: string;
    name: string;
    path: string;
    version: string;
  }>;
  off: (event: string, listener: StubListener) => unknown;
  on: (event: string, listener: StubListener) => unknown;
  once: (event: string, listener: StubListener) => unknown;
  protocol: typeof protocol;
  removeListener: (event: string, listener: StubListener) => unknown;
  setPermissionCheckHandler: (...args: unknown[]) => void;
  setPermissionRequestHandler: (...args: unknown[]) => void;
  webRequest: {
    onBeforeRequest: (...args: unknown[]) => void;
    onBeforeSendHeaders: (...args: unknown[]) => void;
  };
} {
  const emitter = createEmitterStub(label);
  const cookiesEmitter = createEmitterStub(`${label}.cookies`);
  return {
    cookies: {
      flushStore(): Promise<void> {
        log(`${label}.cookies.flushStore`, []);
        return Promise.resolve();
      },
      get(...args: unknown[]): Promise<unknown[]> {
        log(`${label}.cookies.get`, args);
        return Promise.resolve([]);
      },
      off: cookiesEmitter.off,
      on: cookiesEmitter.on,
      once: cookiesEmitter.once,
      remove(...args: unknown[]): Promise<void> {
        log(`${label}.cookies.remove`, args);
        return Promise.resolve();
      },
      removeListener: cookiesEmitter.removeListener,
      set(...args: unknown[]): Promise<void> {
        log(`${label}.cookies.set`, args);
        return Promise.resolve();
      },
    },
    async loadExtension(extensionPath: string): Promise<{
      id: string;
      name: string;
      path: string;
      version: string;
    }> {
      log(`${label}.loadExtension`, [extensionPath]);
      return {
        id: "stub-extension",
        name: "Stub Extension",
        path: extensionPath,
        version: "0.0.0",
      };
    },
    getUserAgent(): string {
      log(`${label}.getUserAgent`, []);
      return "Mozilla/5.0 AppleWebKit/537.36 Chrome/120 Safari/537.36";
    },
    off: emitter.off,
    on: emitter.on,
    once: emitter.once,
    protocol,
    removeListener: emitter.removeListener,
    setPermissionCheckHandler(...args: unknown[]): void {
      log(`${label}.setPermissionCheckHandler`, args);
    },
    setPermissionRequestHandler(...args: unknown[]): void {
      log(`${label}.setPermissionRequestHandler`, args);
    },
    webRequest: {
      onBeforeRequest(...args: unknown[]): void {
        log(`${label}.webRequest.onBeforeRequest`, args);
      },
      onBeforeSendHeaders(...args: unknown[]): void {
        log(`${label}.webRequest.onBeforeSendHeaders`, args);
      },
    },
  };
}
const partitionSessions = new Map<string, ReturnType<typeof createSessionStub>>();
const session = {
  defaultSession: createSessionStub("session.defaultSession"),
  fromPartition(partition: string): ReturnType<typeof createSessionStub> {
    log("session.fromPartition", [partition]);
    let partitionSession = partitionSessions.get(partition);
    if (!partitionSession) {
      partitionSession = createSessionStub(`session.fromPartition(${partition})`);
      partitionSessions.set(partition, partitionSession);
    }
    return partitionSession;
  },
};
const utilityProcess = {
  fork: undefined,
};
const webContents = {
  fromId(id: number): Record<string, unknown> | undefined {
    log("webContents.fromId", [id]);
    return BrowserWindow.getAllWindows().find(
      (window) => window.webContents.id === id,
    )?.webContents;
  },
  getAllWebContents(): Record<string, unknown>[] {
    log("webContents.getAllWebContents", []);
    return BrowserWindow.getAllWindows().map((window) => window.webContents);
  },
  getFocusedWebContents(): Record<string, unknown> | null {
    log("webContents.getFocusedWebContents", []);
    return BrowserWindow.getFocusedWindow()?.webContents ?? null;
  },
};
class MessageChannelMain {
  port1 = createMessagePortStub("MessageChannelMain.port1");
  port2 = createMessagePortStub("MessageChannelMain.port2");
}

const electronModule = new Proxy(
  {
    app,
    BrowserWindow,
    ipcMain,
    autoUpdater,
    crashReporter,
    MessageChannelMain,
    Menu,
    MenuItem,
    net,
    nativeImage,
    nativeTheme,
    Notification,
    powerMonitor,
    protocol,
    screen,
    session,
    Tray,
    utilityProcess,
    WebContentsView,
    webContents,
    dialog,
  } as Record<string, unknown>,
  {
    get(target, prop) {
      if (prop in target) {
        return target[prop as keyof typeof target];
      }

      return createDeepStub(`electron.${String(prop)}`);
    },
  },
);

export {
  app,
  autoUpdater,
  BrowserWindow,
  ipcMain,
  Menu,
  MenuItem,
  MessageChannelMain,
  net,
  nativeImage,
  nativeTheme,
  Notification,
  powerMonitor,
  protocol,
  screen,
  session,
  Tray,
  utilityProcess,
  WebContentsView,
  webContents,
  crashReporter,
  dialog,
};
export default electronModule;
