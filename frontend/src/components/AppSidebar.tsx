import {
  Search,
  Plus,
  FileText,
  Clock,
  Users,
  Sparkles,
  ChevronRight,
  FolderOpen,
  Folder,
  Settings,
  User,
  MoreHorizontal,
  Pencil,
  Trash2,
  FolderPlus,
  FilePlus,
  ExternalLink,
  Music,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useShallow } from "zustand/react/shallow";
import type { WorkspaceFolder } from "@/types/workspace";

type SmartView = "notes" | "recent" | "shared" | "ai";

const smartViews: { title: string; icon: typeof FileText; view: SmartView }[] = [
  { title: "All Notes", icon: FileText, view: "notes" },
  { title: "Recent", icon: Clock, view: "recent" },
  { title: "Shared", icon: Users, view: "shared" },
  { title: "AI Suggested", icon: Sparkles, view: "ai" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const {
    activeNoteId,
    setActiveNote,
    getChildFolders,
    createFolder,
    createNote,
    activeView,
    setActiveView,
    hydrateFolders,
    hydrateNotes,
    hydrateTags,
  } = useWorkspaceStore();

  useEffect(() => {
    void hydrateFolders();
    void hydrateNotes();
    void hydrateTags();
  }, [hydrateFolders, hydrateNotes, hydrateTags]);

  const rootFolders = getChildFolders(null);

  const navigateHome = () => {
    if (pathname !== "/") {
      navigate("/");
    }
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-3 space-y-3">
        {!collapsed && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-h3 font-semibold text-foreground tracking-tight">
                Camel
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-sand-200"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={() => createNote("Untitled", null)}
                  >
                    <FilePlus className="h-4 w-4 mr-2" />
                    New Note
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => createFolder("New Folder", null)}
                  >
                    <FolderPlus className="h-4 w-4 mr-2" />
                    New Folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search notes…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-body bg-card border-border focus-visible:ring-ring"
              />
            </div>
          </>
        )}
      </SidebarHeader>

      <SidebarContent>
        {/* Smart Views */}
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-label-xs text-muted-foreground uppercase tracking-wider px-3">
              Views
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {smartViews.map((view) => {
                const isDedicated = view.view === "recent" || view.view === "shared";
                const isActive =
                  pathname === "/" &&
                  (isDedicated
                    ? activeView === view.view
                    : view.view === "notes"
                      ? activeView === "notes" && !activeNoteId
                      : false);
                return (
                  <SidebarMenuItem key={view.title}>
                    <SidebarMenuButton
                      onClick={() => {
                        navigateHome();
                        setActiveNote(null);
                        if (view.view === "ai") {
                          setActiveView("notes");
                        } else {
                          setActiveView(view.view);
                        }
                      }}
                      isActive={isActive}
                      tooltip={view.title}
                      className="hover:bg-sand-200 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                    >
                      <view.icon className="h-4 w-4" />
                      {!collapsed && <span>{view.title}</span>}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Workspace Tree */}
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-label-xs text-muted-foreground uppercase tracking-wider px-3">
              Folders
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {rootFolders.map((folder) => (
                <FolderTreeItem
                  key={folder.id}
                  folder={folder}
                  collapsed={collapsed}
                  depth={0}
                />
              ))}
              {/* Root-level notes */}
              <RootNotes collapsed={collapsed} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Music"
              onClick={() => {
                navigateHome();
                setActiveView("music");
              }}
              isActive={pathname === "/" && activeView === "music"}
              className="hover:bg-sand-200 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
            >
              <Music className="h-4 w-4" />
              {!collapsed && <span>Music</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Settings"
              onClick={() => navigate("/settings")}
              isActive={pathname === "/settings"}
              className="hover:bg-sand-200 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
            >
              <Settings className="h-4 w-4" />
              {!collapsed && <span>Settings</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Profile"
              onClick={() => navigate("/profile")}
              isActive={pathname === "/profile"}
              className="hover:bg-sand-200 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
            >
              <User className="h-4 w-4" />
              {!collapsed && <span>Profile</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

/* ── Inline rename input ── */
function InlineRename({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <Input
      ref={ref}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(text)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(text);
        if (e.key === "Escape") onCancel();
      }}
      className="h-6 text-body px-1 py-0 border-border"
    />
  );
}

/* ── Root-level notes (no folder) ── */
function RootNotes({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate();
  const notes = useWorkspaceStore(useShallow((s) => s.notes.filter((n) => n.parentFolderId === null)));
  const { activeNoteId, setActiveNote, renameNote, deleteNote } = useWorkspaceStore(
    useShallow((s) => ({
      activeNoteId: s.activeNoteId,
      setActiveNote: s.setActiveNote,
      renameNote: s.renameNote,
      deleteNote: s.deleteNote,
    }))
  );
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const goHome = () => {
    if (window.location.pathname !== "/") {
      navigate("/");
    }
  };

  if (notes.length === 0) return null;

  return (
    <>
      {notes.map((note) => (
        <SidebarMenuItem key={note.id}>
          <SidebarMenuButton
            onClick={() => {
              goHome();
              setActiveNote(note.id);
            }}
            isActive={activeNoteId === note.id}
            tooltip={note.title}
            className="group/note hover:bg-sand-200 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
          >
            <FileText className="h-4 w-4 shrink-0" />
            {!collapsed &&
              (renamingId === note.id ? (
                <InlineRename
                  value={note.title}
                  onCommit={(v) => {
                    if (v.trim()) renameNote(note.id, v.trim());
                    setRenamingId(null);
                  }}
                  onCancel={() => setRenamingId(null)}
                />
              ) : (
                <span className="flex-1 truncate">{note.title}</span>
              ))}
            {!collapsed && renamingId !== note.id && (
              <NoteContextMenu
                onRename={() => setRenamingId(note.id)}
                onDelete={() => deleteNote(note.id)}
              />
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </>
  );
}

/* ── Folder tree item ── */
function FolderTreeItem({
  folder,
  collapsed,
  depth,
}: {
  folder: WorkspaceFolder;
  collapsed: boolean;
  depth: number;
}) {
  const navigate = useNavigate();
  const {
    getChildFolders,
    getNotesInFolder,
    expandedFolders,
    toggleFolder,
    activeNoteId,
    setActiveNote,
    renameFolder,
    deleteFolder,
    createFolder,
    createNote,
    renameNote,
    deleteNote,
    setActiveView,
    openShareDialog,
  } = useWorkspaceStore();

  const goHome = () => {
    if (window.location.pathname !== "/") {
      navigate("/");
    }
  };

  const childFolders = getChildFolders(folder.id);
  const notes = getNotesInFolder(folder.id);
  const isExpanded = expandedFolders.has(folder.id);
  const [renaming, setRenaming] = useState(false);
  const [renamingNoteId, setRenamingNoteId] = useState<string | null>(null);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={() => {
          goHome();
          toggleFolder(folder.id);
        }}
        tooltip={folder.name}
        className="group/folder hover:bg-sand-200"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${
            isExpanded ? "rotate-90" : ""
          }`}
        />
        {isExpanded ? (
          <FolderOpen className="h-4 w-4 shrink-0" />
        ) : (
          <Folder className="h-4 w-4 shrink-0" />
        )}
        {!collapsed &&
          (renaming ? (
            <InlineRename
              value={folder.name}
              onCommit={(v) => {
                if (v.trim()) renameFolder(folder.id, v.trim());
                setRenaming(false);
              }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <>
              <span className="flex-1 truncate">{folder.name}</span>
              <span className="text-meta text-muted-foreground">
                {notes.length}
              </span>
            </>
          ))}
        {!collapsed && !renaming && (
          <FolderContextMenu
            onRename={() => setRenaming(true)}
            onDelete={() => deleteFolder(folder.id)}
            onNewNote={() => createNote("Untitled", folder.id)}
            onNewFolder={() => createFolder("New Folder", folder.id)}
            onShare={() => {
              goHome();
              setActiveView("shared");
              openShareDialog("folder", folder.id);
            }}
          />
        )}
      </SidebarMenuButton>

      {isExpanded && (childFolders.length > 0 || notes.length > 0) && (
        <SidebarMenuSub>
          {childFolders.map((child) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              collapsed={collapsed}
              depth={depth + 1}
            />
          ))}
          {notes.map((note) => (
            <SidebarMenuItem key={note.id}>
              <SidebarMenuButton
                onClick={() => {
                  goHome();
                  setActiveNote(note.id);
                }}
                isActive={activeNoteId === note.id}
                tooltip={note.title}
                className="group/note hover:bg-sand-200 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                {!collapsed &&
                  (renamingNoteId === note.id ? (
                    <InlineRename
                      value={note.title}
                      onCommit={(v) => {
                        if (v.trim()) renameNote(note.id, v.trim());
                        setRenamingNoteId(null);
                      }}
                      onCancel={() => setRenamingNoteId(null)}
                    />
                  ) : (
                    <span className="flex-1 truncate">{note.title}</span>
                  ))}
                {!collapsed && renamingNoteId !== note.id && (
                  <NoteContextMenu
                    onRename={() => setRenamingNoteId(note.id)}
                    onDelete={() => deleteNote(note.id)}
                  />
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}

/* ── Context menus ── */
function FolderContextMenu({
  onRename,
  onDelete,
  onNewNote,
  onNewFolder,
  onShare,
}: {
  onRename: () => void;
  onDelete: () => void;
  onNewNote: () => void;
  onNewFolder: () => void;
  onShare: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => e.stopPropagation()}
          className="opacity-0 group-hover/folder:opacity-100 focus:opacity-100 p-0.5 rounded hover:bg-sand-300 transition-opacity"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onNewNote(); }}>
          <FilePlus className="h-4 w-4 mr-2" />
          New Note
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onNewFolder(); }}>
          <FolderPlus className="h-4 w-4 mr-2" />
          New Folder
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onShare(); }}>
          <ExternalLink className="h-4 w-4 mr-2" />
          Share
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRename(); }}>
          <Pencil className="h-4 w-4 mr-2" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NoteContextMenu({
  onRename,
  onDelete,
}: {
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => e.stopPropagation()}
          className="opacity-0 group-hover/note:opacity-100 focus:opacity-100 p-0.5 rounded hover:bg-sand-300 transition-opacity"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRename(); }}>
          <Pencil className="h-4 w-4 mr-2" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
