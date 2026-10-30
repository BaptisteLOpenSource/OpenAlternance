import {
  Building2,
  CalendarDays,
  ChevronsUpDown,
  FileText,
  FolderOpen,
  LayoutDashboard,
  ListTodo,
  Command,
  LogOut,
  Mail,
  Menu,
  Moon,
  PanelLeft,
  Plus,
  Search,
  Handshake,
  Sheet,
  Sun,
  Trophy,
  UserRound,
  X,
} from "lucide-preact";
import { type ComponentChildren, type Ref, render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { COMMANDS, type Ctx, forScope, lettreOf } from "./commands";
import { CompaniesPage } from "./companies";
import { DashboardPage } from "./dashboard";
import { CompanyPage } from "./company";
import { ActionDialog } from "./dialogs";
import { CalendarPage, LettresPage } from "./pages";
import { CommandPalette, type PaletteItem } from "./palette";
import { ContextMenu, CustomizeMenu, MenuButton } from "./menus";
import { DocumentsPage } from "./documents";
import { EntretiensPage } from "./entretiens";
import { LoginPage } from "./login";
import { ComptePage } from "./profil";
import { TableurPage } from "./tableur";
import { TodoPage } from "./todo";
import { type DialogState, type Open, isTodo, readHidden, store, stored, writeHidden } from "./shared";
import { type AppState, useStore } from "./store";
import { ToastProvider, Tooltip } from "./fx";
import { Button, Card, CardAction, CardHeader, CardTitle, Dialog, Input, cn } from "./ui";

const NAV = [
  {
    group: "Pilotage",
    items: [
      { path: "", label: "Dashboard", icon: LayoutDashboard },
      { path: "todo", label: "Todo", icon: ListTodo },
      { path: "calendrier", label: "Calendrier", icon: CalendarDays },
    ],
  },
  {
    group: "Candidatures",
    items: [
      { path: "entreprises", label: "Entreprises", icon: Building2 },
      { path: "tableur", label: "Tableur", icon: Sheet },
      { path: "entretiens", label: "Entretiens", icon: Handshake },
      { path: "lettres", label: "Lettres", icon: Mail },
    ],
  },
  {
    group: "Documents",
    items: [
      { path: "documents", label: "Documents", icon: FolderOpen },
      { path: "cv", label: "CV", icon: FileText },
    ],
  },
  {
    group: "Compte",
    items: [{ path: "compte", label: "Mon compte", icon: UserRound }],
  },
] as const;

// Blurred corner blobs per page; never centered. Keys = page path, "" = dashboard.
const GLOW: Record<string, string[]> = {
  "": [
    "absolute -left-32 -top-32 size-[30rem] rounded-full bg-blue-500/[0.07] blur-[140px] max-md:blur-[72px]",
    "absolute -bottom-40 -right-40 size-[34rem] rounded-full bg-violet-500/[0.07] blur-[140px] max-md:blur-[72px]",
  ],
  todo: [
    "absolute -right-32 top-16 size-[28rem] rounded-full bg-red-500/[0.07] blur-[140px] max-md:blur-[72px]",
    "absolute -bottom-40 -left-24 size-[32rem] rounded-full bg-orange-500/[0.07] blur-[140px] max-md:blur-[72px]",
  ],
  calendrier: ["absolute -left-32 -top-32 size-[28rem] rounded-full bg-teal-500/[0.07] blur-[140px] max-md:blur-[72px]"],
  entreprises: [
    "absolute -left-24 -top-32 size-[30rem] rounded-full bg-amber-500/[0.07] blur-[140px] max-md:blur-[72px]",
    "absolute -bottom-40 -right-32 size-[34rem] rounded-full bg-rose-500/[0.07] blur-[140px] max-md:blur-[72px]",
  ],
  tableur: [
    "absolute -right-32 -top-24 size-[28rem] rounded-full bg-green-500/[0.07] blur-[140px] max-md:blur-[72px]",
    "absolute -bottom-40 -left-32 size-[32rem] rounded-full bg-sky-500/[0.07] blur-[140px] max-md:blur-[72px]",
  ],
  entretiens: ["absolute -bottom-40 -right-32 size-[30rem] rounded-full bg-fuchsia-500/[0.07] blur-[140px] max-md:blur-[72px]"],
  lettres: [
    "absolute -left-32 -top-24 size-[30rem] rounded-full bg-indigo-500/[0.07] blur-[140px] max-md:blur-[72px]",
    "absolute -bottom-40 -right-24 size-[28rem] rounded-full bg-yellow-500/[0.07] blur-[140px] max-md:blur-[72px]",
  ],
  documents: ["absolute -right-32 -top-32 size-[30rem] rounded-full bg-cyan-500/[0.07] blur-[140px] max-md:blur-[72px]"],
  cv: ["absolute -bottom-40 -left-32 size-[32rem] rounded-full bg-emerald-500/[0.07] blur-[140px] max-md:blur-[72px]"],
  compte: ["absolute -right-24 -top-32 size-[30rem] rounded-full bg-orange-500/[0.07] blur-[140px] max-md:blur-[72px]"],
};

const PAGES = NAV.flatMap((g): { path: string; label: string; icon: typeof Building2 }[] => [...g.items]);

// Preact aria role typings lack "dialog": spread keeps it out of the union check.
const DRAWER_ARIA: Record<string, string> = { role: "dialog", "aria-modal": "true" };

function useHash(): string {
  const read = () => location.hash.replace(/^#\/?/, "");
  const [hash, setHash] = useState(read);
  useEffect(() => {
    const onChange = () => setHash(read());
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function navCount(path: string, state: AppState | null): { value: number; alert?: boolean } | null {
  if (!state) return null;
  if (path === "todo") {
    const todo = state.companies.filter((c) => isTodo(c, state.today)).length;
    return todo > 0 ? { value: todo, alert: true } : null;
  }
  if (path === "entreprises") return { value: state.companies.length };
  if (path === "lettres") return { value: state.lettres.filter((l) => l.type === "lettre").length };
  return null;
}

function Sidebar({
  route,
  state,
  collapsed,
  mobileOpen,
  onClose,
  onOpen,
  onLogout,
}: {
  route: string;
  state: AppState | null;
  collapsed: boolean;
  mobileOpen: boolean;
  onClose: () => void;
  onOpen: Open;
  onLogout: () => void;
}) {
  // Collapsed rail only on desktop; mobile drawer always shows labels.
  const rail = collapsed && !mobileOpen;
  const [menu, setMenu] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  // Drawer opened: move focus to its close button so keyboard users land inside it.
  useEffect(() => {
    if (mobileOpen) asideRef.current?.querySelector<HTMLElement>('button[aria-label="Fermer le menu"]')?.focus();
  }, [mobileOpen]);
  return (
    <>
      {mobileOpen && <div class="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={onClose} />}
      <aside
        ref={asideRef}
        id="sidebar"
        aria-label={mobileOpen ? "Menu" : "Navigation principale"}
        {...(mobileOpen ? DRAWER_ARIA : {})}
        class={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-sidebar transition-[width,transform,visibility] duration-200 md:sticky md:top-0 md:h-dvh md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full max-md:invisible",
          rail && "md:w-16",
        )}
      >
        <div class={cn("flex h-16 shrink-0 items-center gap-3 border-b px-4", rail && "md:justify-center md:px-0")}>
          <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Trophy class="size-4" />
          </div>
          <div class={cn("grid leading-tight", rail && "md:hidden")}>
            <span class="font-semibold">Alternance</span>
            <span class="text-xs text-muted-foreground">Suivi des démarches</span>
          </div>
          <Button variant="ghost" size="icon" class="ml-auto md:hidden" onClick={onClose} aria-label="Fermer le menu">
            <X />
          </Button>
        </div>

        <nav aria-label="Principal" class="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
          {NAV.map(({ group, items }) => (
            <div class="grid gap-1">
              <h2 class={cn("px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground", rail && "md:sr-only")}>
                {group}
              </h2>
              {items.map(({ path, label, icon: Icon }) => {
                const count = navCount(path, state);
                const active = route === path;
                return (
                  <a
                    href={`#/${path}`}
                    onClick={onClose}
                    title={rail ? label : undefined}
                    aria-current={active ? "page" : undefined}
                    class={cn(
                      "icon-hover relative flex h-11 items-center gap-3 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:h-9",
                      active && "bg-accent font-medium text-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary",
                      rail && "md:justify-center md:px-0",
                    )}
                  >
                    <Icon class="size-[18px] shrink-0" />
                    <span class={cn("flex-1", rail && "md:hidden")}>{label}</span>
                    {count && (
                      <span
                        class={cn(
                          "rounded-full px-1.5 text-xs font-medium tabular-nums",
                          count.alert ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground",
                          rail && "md:absolute md:right-1 md:top-0.5 md:px-1 md:text-[10px]",
                          rail && !count.alert && "md:hidden",
                        )}
                      >
                        {count.value}
                      </span>
                    )}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        <div class="grid gap-3 border-t p-3">
          <MenuButton
            label="Nouveau"
            compact={rail}
            items={[
              { label: "Nouvelle entreprise", run: () => onOpen({ kind: "entreprise" }) },
              { label: "Nouvelle lettre de motivation", run: () => onOpen({ kind: "lettre" }) },
              { label: "Nouveau document (PDF, TXT, Markdown)", run: () => onOpen({ kind: "document" }) },
            ]}
          />
          <div class="relative" onFocusOut={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setMenu(false)}>
            <button
              type="button"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
              class={cn("flex w-full items-center gap-3 rounded-md px-1 py-1 text-left hover:bg-accent", rail && "md:justify-center md:px-0")}
            >
              <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                {(state?.profil.username || "Candidat").charAt(0).toUpperCase()}
              </div>
              <div class={cn("grid flex-1 text-sm leading-tight", rail && "md:hidden")}>
                <span class="font-medium">{state?.profil.username || "Candidat"}</span>
                <span class="text-xs text-muted-foreground">Alternance 2026</span>
              </div>
              <ChevronsUpDown class={cn("size-4 text-muted-foreground", rail && "md:hidden")} />
            </button>
            {menu && (
              <div class="absolute inset-x-0 bottom-full mb-2 grid rounded-md border bg-background p-1 shadow-md">
                <button
                  type="button"
                  onClick={() => {
                    setMenu(false);
                    onLogout();
                  }}
                  class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <LogOut class="size-4" />
                  Se déconnecter
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function Header({
  title,
  search,
  onSearch,
  onToggleSidebar,
  sidebarOpen,
  toggleRef,
  onOpen,
  onPalette,
  actions,
}: {
  title: string;
  search: string;
  onSearch: (value: string) => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  toggleRef: Ref<HTMLButtonElement>;
  onOpen: Open;
  onPalette: () => void;
  actions: ComponentChildren;
}) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (searchOpen) mobileSearchRef.current?.focus();
  }, [searchOpen]);
  const onSearchInput = (value: string) => {
    onSearch(value);
    if (!["#/entreprises", "#/tableur"].includes(location.hash)) location.hash = "#/entreprises";
  };
  const toggleTheme = () => {
    document.documentElement.classList.toggle("dark", !dark);
    store("theme", dark ? "light" : "dark");
    setDark(!dark);
  };
  return (
    <header class="sticky top-0 z-20 border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div class="flex h-16 items-center gap-2 px-4 sm:gap-3 md:px-6">
        <Button
          ref={toggleRef}
          variant="ghost"
          size="icon-sm"
          onClick={onToggleSidebar}
          aria-label="Afficher / masquer la barre latérale"
          aria-controls="sidebar"
          aria-expanded={sidebarOpen}
        >
          <Menu class="sm:hidden" />
          <PanelLeft class="hidden sm:block" />
        </Button>
        <div class="hidden h-4 w-px bg-border sm:block" />
        <nav class="hidden items-center gap-1.5 text-sm sm:flex" aria-label="Fil d'Ariane">
          <span class="text-muted-foreground">Alternance</span>
          <span class="text-muted-foreground">/</span>
          <span class="font-medium">{title}</span>
        </nav>
        <span class="min-w-0 flex-1 truncate font-medium sm:hidden">{title}</span>
        <div class="relative ml-auto hidden min-w-0 flex-1 sm:block sm:max-w-xs">
          <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            type="search"
            aria-label="Rechercher"
            placeholder="Rechercher..."
            class="pl-8 pr-8"
            value={search}
            onInput={(e) => onSearchInput(e.currentTarget.value)}
          />
          <kbd class="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 text-xs text-muted-foreground md:block">/</kbd>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          class="sm:hidden"
          aria-label="Rechercher"
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen(!searchOpen)}
        >
          <Search />
        </Button>
        <Button size="sm" class="max-sm:size-10 max-sm:px-0" aria-label="Nouvel échange" onClick={() => onOpen({ kind: "echange" })}>
          <Plus />
          <span class="hidden sm:inline">Échange</span>
        </Button>
        <Tooltip content="Commandes (Ctrl+K)">
          <Button variant="outline" size="icon-sm" onClick={onPalette} aria-label="Commandes">
            <Command />
          </Button>
        </Tooltip>
        {actions}
        <Button variant="outline" size="icon-sm" onClick={toggleTheme} aria-label="Changer de thème">
          {dark ? <Sun /> : <Moon />}
        </Button>
      </div>
      {searchOpen && (
        <div class="px-4 pb-3 sm:hidden">
          <div class="relative">
            <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={mobileSearchRef}
              type="search"
              aria-label="Rechercher"
              placeholder="Rechercher..."
              class="pl-8 max-sm:h-11"
              value={search}
              onInput={(e) => onSearchInput(e.currentTarget.value)}
            />
          </div>
        </div>
      )}
    </header>
  );
}

function App() {
  const { state, error, locked, login, logout, clearError, send, reload } = useStore();
  const route = useHash();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => stored("sidebar") === "collapsed");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [hidden, setHidden] = useState(readHidden);
  const [base, sub] = route.split("/");
  const page = PAGES.find((p) => p.path === base) ?? PAGES[0];
  const companyId = page.path === "entreprises" && sub ? Number(sub) : null;
  const company = state?.companies.find((c) => c.id === companyId);
  const openCompany = (id: number) => (location.hash = `#/entreprises/${id}`);
  const scope = company ? "company" : page.path || "dashboard";
  const lettre = !state
    ? null
    : company
      ? (lettreOf(company, state) ?? null)
      : (state.lettres.find((l) => page.path === "lettres" && l.file === decodeURIComponent(sub ?? "")) ?? null);
  const ctx: Ctx | null = state && { state, send, open: setDialog, reload, company: company ?? null, lettre };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const toggleHidden = (id: string) => {
    const next = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
    writeHidden(next);
    setHidden(next);
  };
  const runner = (run: (c: Ctx) => unknown) => () => ctx && run(ctx);
  const menuItems = forScope(scope)
    .filter((c) => c.pinned || !hidden.includes(c.id))
    .map((c) => ({ label: c.label, run: runner(c.run) }));
  const paletteItems: PaletteItem[] = state
    ? [
        ...PAGES.map((p) => ({ id: `page-${p.path}`, label: `Aller à ${p.label}`, hint: "Page", run: () => (location.hash = `#/${p.path}`) })),
        ...state.companies.map((c) => ({ id: `company-${c.id}`, label: c.nom, hint: "Entreprise", run: () => openCompany(c.id) })),
        ...forScope(scope).map((c) => ({ id: c.id, label: c.label, hint: "Action", run: runner(c.run) })),
      ]
    : [];
  const onContextMenu = (e: MouseEvent) => {
    if (!ctx || (e.target as Element).closest("input, textarea, select, [contenteditable]")) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  // Focus back on the hamburger once the drawer closes (any path: Escape, overlay, X, link).
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerWasOpen = useRef(false);
  useEffect(() => {
    if (mobileOpen) drawerWasOpen.current = true;
    else if (drawerWasOpen.current) {
      drawerWasOpen.current = false;
      toggleRef.current?.focus();
    }
  }, [mobileOpen]);
  useEffect(() => {
    const desktop = matchMedia("(min-width: 768px)");
    const reset = () => desktop.matches && setMobileOpen(false);
    desktop.addEventListener("change", reset);
    return () => desktop.removeEventListener("change", reset);
  }, []);

  const toggleSidebar = () => {
    if (matchMedia("(min-width: 768px)").matches) {
      store("sidebar", collapsed ? "open" : "collapsed");
      setCollapsed(!collapsed);
    } else {
      setMobileOpen(true);
    }
  };

  if (locked) return <LoginPage onLogin={login} />;

  return (
    <div class="relative flex min-h-dvh" onContextMenu={onContextMenu}>
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
        class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
      >
        Aller au contenu
      </a>
      <div
        key={page.path}
        aria-hidden
        class="pointer-events-none fixed inset-0 -z-10 overflow-hidden transition-opacity duration-700 starting:opacity-0 motion-reduce:transition-none"
      >
        {GLOW[page.path]?.map((cls) => <div class={cls} />)}
      </div>
      <Sidebar
        route={page.path}
        state={state}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onOpen={setDialog}
        onLogout={logout}
      />
      <div class="flex min-w-0 flex-1 flex-col" inert={mobileOpen}>
        <Header
          title={company?.nom ?? page.label}
          search={search}
          onSearch={setSearch}
          onToggleSidebar={toggleSidebar}
          sidebarOpen={matchMedia("(min-width: 768px)").matches ? !collapsed : mobileOpen}
          toggleRef={toggleRef}
          onOpen={setDialog}
          onPalette={() => setPalette(true)}
          actions={<CustomizeMenu commands={COMMANDS.filter((c) => !c.pinned)} hidden={hidden} onToggle={toggleHidden} />}
        />
        <main id="main" tabIndex={-1} class="mx-auto grid w-full max-w-screen-2xl grid-cols-1 flex-1 content-start gap-4 p-4 outline-none md:gap-6 md:p-6">
          {companyId === null && <div class="grid motion-safe:animate-fade-up gap-3">
            <h1 class="text-balance text-3xl font-semibold tracking-tight md:text-4xl">{page.label}</h1>
            {state && <p class="text-sm text-muted-foreground">Mis à jour le {new Date(`${state.today}T00:00`).toLocaleDateString("fr-FR", { dateStyle: "full" })}</p>}
          </div>}
          {error && (
            <div role="alert" class="sticky top-16 z-10 flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
              <Button variant="ghost" size="sm" onClick={clearError}>
                OK
              </Button>
            </div>
          )}
          {!state ? (
            <p role="status" class="text-sm text-muted-foreground">Chargement...</p>
          ) : (
            <>
              {page.path === "" && <DashboardPage state={state} send={send} openCompany={openCompany} onOpen={setDialog} />}
              {page.path === "compte" && <ComptePage profil={state.profil} send={send} />}
              {page.path === "entreprises" &&
                (companyId === null ? (
                  <CompaniesPage state={state} search={search} send={send} onOpen={setDialog} openCompany={openCompany} />
                ) : (
                  <CompanyPage state={state} id={companyId} send={send} onOpen={setDialog} />
                ))}
              {page.path === "todo" && <TodoPage state={state} send={send} />}
              {page.path === "tableur" && <TableurPage state={state} search={search} send={send} openCompany={openCompany} />}
              {page.path === "entretiens" && <EntretiensPage state={state} onOpen={setDialog} openCompany={openCompany} />}
              {page.path === "calendrier" && <CalendarPage state={state} openCompany={openCompany} />}
              {page.path === "lettres" && <LettresPage state={state} send={send} initial={page.path === "lettres" && sub ? decodeURIComponent(sub) : undefined} />}
              {page.path === "documents" && <DocumentsPage state={state} send={send} selected={sub ? decodeURIComponent(sub) : undefined} />}
              {page.path === "cv" && (
                <Card class="overflow-hidden p-0">
                  <CardHeader class="pt-6">
                    <CardTitle>CV</CardTitle>
                    <CardAction>
                      <a href="/api/cv.pdf" target="_blank" rel="noopener" class="text-sm underline underline-offset-4">
                        Ouvrir le CV
                      </a>
                    </CardAction>
                  </CardHeader>
                  {/* iOS Safari does not render PDF in iframes: the header link is the fallback. */}
                  <iframe src="/api/cv.pdf" class="h-[70dvh] w-full md:h-[calc(100dvh-12rem)]" title="CV">
                    <a href="/api/cv.pdf" target="_blank" rel="noopener">Ouvrir le CV</a>
                  </iframe>
                </Card>
              )}
              <ActionDialog dialog={dialog} state={state} send={send} onClose={() => setDialog(null)} />
              {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
              <Dialog open={palette} onClose={() => setPalette(false)} title="Commandes">
                <CommandPalette items={paletteItems} onClose={() => setPalette(false)} />
              </Dialog>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// Module code, not inline script: keeps the CSP free of 'unsafe-inline' for scripts.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
render(
  <ToastProvider>
    <App />
  </ToastProvider>,
  document.getElementById("app")!,
);
