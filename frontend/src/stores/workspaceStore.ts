import { create } from "zustand";
import * as FoldersApi from "@/lib/folders-api";
import * as NotesApi from "@/lib/notes-api";
import * as SharesApi from "@/lib/shares-api";
import * as TagsApi from "@/lib/tags-api";
import type {
  ShareAccessLevel,
  ShareKind,
  WorkspaceFolder,
  WorkspaceNote,
  WorkspaceShare,
  WorkspaceTag,
} from "@/types/workspace";

function genId() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function emptyDocumentJson(): null {
  return null;
}

function serializeDocumentJson(documentJson: unknown): string {
  return JSON.stringify(documentJson ?? []);
}

function defaultTagColor(): string {
  return "#64748b";
}

interface WorkspaceState {
  folders: WorkspaceFolder[];
  notes: WorkspaceNote[];
  tags: WorkspaceTag[];
  sharesByMe: WorkspaceShare[];
  sharesWithMe: WorkspaceShare[];
  activeNoteId: string | null;
  expandedFolders: Set<string>;
  activeView: "notes" | "music" | "settings" | "recent" | "shared";
  foldersHydrated: boolean;
  foldersLoading: boolean;
  notesHydrated: boolean;
  notesLoading: boolean;
  tagsHydrated: boolean;
  tagsLoading: boolean;
  sharesByMeHydrated: boolean;
  sharesByMeLoading: boolean;
  sharesWithMeHydrated: boolean;
  sharesWithMeLoading: boolean;
  shareDialogOpen: boolean;
  shareDialogKind: ShareKind | null;
  shareDialogTargetId: string | null;
  openShareDialog: (kind: ShareKind, targetId: string) => void;
  closeShareDialog: () => void;

  hydrateFolders: () => Promise<void>;
  createFolder: (name: string, parentFolderId: string | null) => string;
  renameFolder: (id: string, name: string) => void;
  moveFolder: (id: string, newParentId: string | null) => void;
  deleteFolder: (id: string) => void;

  hydrateNotes: () => Promise<void>;
  createNote: (title: string, parentFolderId: string | null) => string;
  renameNote: (id: string, title: string) => void;
  moveNote: (id: string, newFolderId: string | null) => void;
  deleteNote: (id: string) => void;
  updateNoteContent: (id: string, documentJson: unknown, plainText: string) => void;

  hydrateTags: () => Promise<void>;
  createTag: (name: string, color?: string | null) => string;
  renameTag: (id: string, name: string) => void;
  updateTagColor: (id: string, color: string | null) => void;
  deleteTag: (id: string) => void;
  setNoteTags: (noteId: string, tagIds: string[]) => void;

  hydrateSharesByMe: () => Promise<void>;
  hydrateSharesWithMe: () => Promise<void>;
  createShare: (args: {
    kind: ShareKind;
    targetId: string;
    recipientEmail: string;
    accessLevel?: ShareAccessLevel;
  }) => Promise<WorkspaceShare | null>;
  updateShareAccess: (id: string, accessLevel: ShareAccessLevel) => Promise<void>;
  revokeShare: (id: string) => Promise<void>;

  setActiveNote: (id: string | null) => void;
  toggleFolder: (id: string) => void;
  setActiveView: (v: "notes" | "music" | "settings" | "recent" | "shared") => void;

  getChildFolders: (parentId: string | null) => WorkspaceFolder[];
  getNotesInFolder: (folderId: string | null) => WorkspaceNote[];
  getActiveNote: () => WorkspaceNote | undefined;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  folders: [],
  notes: [],
  tags: [],
  sharesByMe: [],
  sharesWithMe: [],
  activeNoteId: null,
  expandedFolders: new Set(),
  activeView: "notes",
  foldersHydrated: false,
  foldersLoading: false,
  notesHydrated: false,
  notesLoading: false,
  tagsHydrated: false,
  tagsLoading: false,
  sharesByMeHydrated: false,
  sharesByMeLoading: false,
  sharesWithMeHydrated: false,
  sharesWithMeLoading: false,

  hydrateFolders: async () => {
    if (get().foldersLoading) return;
    set({ foldersLoading: true });
    try {
      const folders = await FoldersApi.listFolders();
      set((s) => {
        const existingIds = new Set(folders.map((folder) => folder.id));
        return {
          folders,
          foldersHydrated: true,
          foldersLoading: false,
          expandedFolders: new Set([...s.expandedFolders].filter((id) => existingIds.has(id))),
        };
      });
    } catch (err) {
      console.error("Failed to load folders", err);
      set({ foldersHydrated: true, foldersLoading: false });
    }
  },

  createFolder: (name, parentFolderId) => {
    const id = genId();
    const trimmed = name.trim() || "New Folder";
    const folder: WorkspaceFolder = {
      id,
      parentFolderId,
      name: trimmed,
      sortOrder: get().folders.filter((f) => f.parentFolderId === parentFolderId).length,
      createdAt: now(),
      updatedAt: now(),
    };
    set((s) => ({
      folders: [...s.folders, folder],
      expandedFolders: parentFolderId ? new Set([...s.expandedFolders, parentFolderId]) : s.expandedFolders,
    }));
    void FoldersApi.createFolder({ id, name: trimmed, parentId: parentFolderId }).catch((err) => {
      console.error("Failed to create folder", err);
      set((s) => ({ folders: s.folders.filter((f) => f.id !== id) }));
    });
    return id;
  },

  renameFolder: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const previous = get().folders.find((f) => f.id === id);
    if (!previous) return;
    set((s) => ({
      folders: s.folders.map((f) => (f.id === id ? { ...f, name: trimmed, updatedAt: now() } : f)),
    }));
    void FoldersApi.updateFolder(id, { name: trimmed }).catch((err) => {
      console.error("Failed to rename folder", err);
      set((s) => ({ folders: s.folders.map((f) => (f.id === id ? previous : f)) }));
    });
  },

  moveFolder: (id, newParentId) => {
    const previous = get().folders.find((f) => f.id === id);
    if (!previous) return;
    set((s) => ({
      folders: s.folders.map((f) =>
        f.id === id ? { ...f, parentFolderId: newParentId, updatedAt: now() } : f
      ),
    }));
    void FoldersApi.updateFolder(id, { parentId: newParentId }).catch((err) => {
      console.error("Failed to move folder", err);
      set((s) => ({ folders: s.folders.map((f) => (f.id === id ? previous : f)) }));
    });
  },

  deleteFolder: (id) => {
    const allIds = new Set<string>();
    const collect = (fid: string) => {
      allIds.add(fid);
      get()
        .folders.filter((f) => f.parentFolderId === fid)
        .forEach((f) => collect(f.id));
    };
    collect(id);
    const previousFolders = get().folders;
    set((s) => ({ folders: s.folders.filter((f) => !allIds.has(f.id)) }));
    void FoldersApi.deleteFolder(id).catch((err) => {
      console.error("Failed to delete folder", err);
      set({ folders: previousFolders });
    });
  },

  hydrateNotes: async () => {
    if (get().notesLoading) return;
    set({ notesLoading: true });
    try {
      const notes = await NotesApi.listNotes();
      set((s) => ({
        notes,
        notesHydrated: true,
        notesLoading: false,
        activeNoteId: s.activeNoteId && notes.some((note) => note.id === s.activeNoteId) ? s.activeNoteId : null,
      }));
    } catch (err) {
      console.error("Failed to load notes", err);
      set({ notesHydrated: true, notesLoading: false });
    }
  },

  createNote: (title, parentFolderId) => {
    const id = genId();
    const trimmed = title.trim() || "Untitled";
    const note: WorkspaceNote = {
      id,
      parentFolderId,
      title: trimmed,
      documentJson: emptyDocumentJson(),
      plainText: "",
      isArchived: false,
      deletedAt: null,
      tags: [],
      createdAt: now(),
      updatedAt: now(),
    };
    set((s) => ({ notes: [...s.notes, note], activeNoteId: id }));
    void NotesApi.createNote({
      id,
      folderId: parentFolderId,
      title: trimmed,
      content: serializeDocumentJson(note.documentJson),
      plainText: "",
    }).then((saved) => {
      set((s) => ({ notes: s.notes.map((n) => (n.id === id ? saved : n)) }));
    }).catch((err) => {
      console.error("Failed to create note", err);
      set((s) => ({
        notes: s.notes.filter((n) => n.id !== id),
        activeNoteId: s.activeNoteId === id ? null : s.activeNoteId,
      }));
    });
    return id;
  },

  renameNote: (id, title) => {
    const previous = get().notes.find((n) => n.id === id);
    if (!previous) return;
    const nextTitle = title.trim() || "Untitled";
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, title: nextTitle, updatedAt: now() } : n)),
    }));
    void NotesApi.updateNote(id, { title: nextTitle }).then((saved) => {
      set((s) => ({ notes: s.notes.map((n) => (n.id === id ? saved : n)) }));
    }).catch((err) => {
      console.error("Failed to rename note", err);
      set((s) => ({ notes: s.notes.map((n) => (n.id === id ? previous : n)) }));
    });
  },

  moveNote: (id, newFolderId) => {
    const previous = get().notes.find((n) => n.id === id);
    if (!previous) return;
    set((s) => ({
      notes: s.notes.map((n) =>
        n.id === id ? { ...n, parentFolderId: newFolderId, updatedAt: now() } : n
      ),
    }));
    void NotesApi.updateNote(id, { folderId: newFolderId }).then((saved) => {
      set((s) => ({ notes: s.notes.map((n) => (n.id === id ? saved : n)) }));
    }).catch((err) => {
      console.error("Failed to move note", err);
      set((s) => ({ notes: s.notes.map((n) => (n.id === id ? previous : n)) }));
    });
  },

  deleteNote: (id) => {
    const previous = get().notes.find((n) => n.id === id);
    if (!previous) return;
    set((s) => ({
      notes: s.notes.filter((n) => n.id !== id),
      activeNoteId: s.activeNoteId === id ? null : s.activeNoteId,
    }));
    void NotesApi.deleteNote(id).catch((err) => {
      console.error("Failed to delete note", err);
      set((s) => ({ notes: [...s.notes, previous] }));
    });
  },

  updateNoteContent: (id, documentJson, plainText) => {
    const previous = get().notes.find((n) => n.id === id);
    if (!previous) return;
    set((s) => ({
      notes: s.notes.map((n) =>
        n.id === id ? { ...n, documentJson, plainText, updatedAt: now() } : n
      ),
    }));
    void NotesApi.updateNote(id, {
      content: serializeDocumentJson(documentJson),
      plainText,
    }).then((saved) => {
      set((s) => ({ notes: s.notes.map((n) => (n.id === id ? saved : n)) }));
    }).catch((err) => {
      console.error("Failed to save note content", err);
    });
  },

  hydrateTags: async () => {
    if (get().tagsLoading) return;
    set({ tagsLoading: true });
    try {
      const tags = await TagsApi.listTags();
      set({ tags, tagsHydrated: true, tagsLoading: false });
    } catch (err) {
      console.error("Failed to load tags", err);
      set({ tagsHydrated: true, tagsLoading: false });
    }
  },

  createTag: (name, color = defaultTagColor()) => {
    const id = genId();
    const trimmed = name.trim();
    if (!trimmed) return "";
    const tag: WorkspaceTag = {
      id,
      name: trimmed,
      color,
      createdAt: now(),
      updatedAt: now(),
    };
    set((s) => ({ tags: [...s.tags, tag] }));
    void TagsApi.createTag({ id, name: trimmed, color }).then((saved) => {
      set((s) => ({ tags: s.tags.map((t) => (t.id === id ? saved : t)) }));
    }).catch((err) => {
      console.error("Failed to create tag", err);
      set((s) => ({ tags: s.tags.filter((t) => t.id !== id) }));
    });
    return id;
  },

  renameTag: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const previous = get().tags.find((tag) => tag.id === id);
    if (!previous) return;
    set((s) => ({ tags: s.tags.map((tag) => (tag.id === id ? { ...tag, name: trimmed } : tag)) }));
    void TagsApi.updateTag(id, { name: trimmed }).then((saved) => {
      set((s) => ({ tags: s.tags.map((tag) => (tag.id === id ? saved : tag)) }));
    }).catch((err) => {
      console.error("Failed to rename tag", err);
      set((s) => ({ tags: s.tags.map((tag) => (tag.id === id ? previous : tag)) }));
    });
  },

  updateTagColor: (id, color) => {
    const previous = get().tags.find((tag) => tag.id === id);
    if (!previous) return;
    set((s) => ({ tags: s.tags.map((tag) => (tag.id === id ? { ...tag, color } : tag)) }));
    void TagsApi.updateTag(id, { color }).then((saved) => {
      set((s) => ({ tags: s.tags.map((tag) => (tag.id === id ? saved : tag)) }));
    }).catch((err) => {
      console.error("Failed to update tag color", err);
      set((s) => ({ tags: s.tags.map((tag) => (tag.id === id ? previous : tag)) }));
    });
  },

  deleteTag: (id) => {
    const previousTags = get().tags;
    const previousNotes = get().notes;
    set((s) => ({
      tags: s.tags.filter((tag) => tag.id !== id),
      notes: s.notes.map((note) => ({
        ...note,
        tags: note.tags.filter((tag) => tag.id !== id),
      })),
    }));
    void TagsApi.deleteTag(id).catch((err) => {
      console.error("Failed to delete tag", err);
      set({ tags: previousTags, notes: previousNotes });
    });
  },

  setNoteTags: (noteId, tagIds) => {
    const previous = get().notes.find((note) => note.id === noteId);
    if (!previous) return;
    const nextTags = get().tags.filter((tag) => tagIds.includes(tag.id));
    set((s) => ({
      notes: s.notes.map((note) => (note.id === noteId ? { ...note, tags: nextTags } : note)),
    }));
    void NotesApi.replaceNoteTags(noteId, tagIds).then((saved) => {
      set((s) => ({ notes: s.notes.map((note) => (note.id === noteId ? saved : note)) }));
    }).catch((err) => {
      console.error("Failed to update note tags", err);
      set((s) => ({ notes: s.notes.map((note) => (note.id === noteId ? previous : note)) }));
    });
  },

  hydrateSharesByMe: async () => {
    if (get().sharesByMeLoading) return;
    set({ sharesByMeLoading: true });
    try {
      const shares = await SharesApi.listShares("by-me");
      set({ sharesByMe: shares, sharesByMeHydrated: true, sharesByMeLoading: false });
    } catch (err) {
      console.error("Failed to load shares (by-me)", err);
      set({ sharesByMeHydrated: true, sharesByMeLoading: false });
    }
  },

  hydrateSharesWithMe: async () => {
    if (get().sharesWithMeLoading) return;
    set({ sharesWithMeLoading: true });
    try {
      const shares = await SharesApi.listShares("with-me");
      set({ sharesWithMe: shares, sharesWithMeHydrated: true, sharesWithMeLoading: false });
    } catch (err) {
      console.error("Failed to load shares (with-me)", err);
      set({ sharesWithMeHydrated: true, sharesWithMeLoading: false });
    }
  },

  shareDialogOpen: false,
  shareDialogKind: null,
  shareDialogTargetId: null,
  openShareDialog: (kind, targetId) => set({ shareDialogOpen: true, shareDialogKind: kind, shareDialogTargetId: targetId }),
  closeShareDialog: () => set({ shareDialogOpen: false, shareDialogKind: null, shareDialogTargetId: null }),

  createShare: async ({ kind, targetId, recipientEmail, accessLevel }) => {
    try {
      const share = await SharesApi.createShare({ kind, targetId, recipientEmail, accessLevel });
      set((s) => ({ sharesByMe: [share, ...s.sharesByMe] }));
      return share;
    } catch (err) {
      console.error("Failed to create share", err);
      return null;
    }
  },

  updateShareAccess: async (id, accessLevel) => {
    const previous = get().sharesByMe.find((s) => s.id === id);
    if (!previous) return;
    set((s) => ({
      sharesByMe: s.sharesByMe.map((share) =>
        share.id === id ? { ...share, accessLevel } : share
      ),
    }));
    try {
      const updated = await SharesApi.updateShare(id, { accessLevel });
      set((s) => ({
        sharesByMe: s.sharesByMe.map((share) => (share.id === id ? updated : share)),
      }));
    } catch (err) {
      console.error("Failed to update share", err);
      set((s) => ({
        sharesByMe: s.sharesByMe.map((share) => (share.id === id ? previous : share)),
      }));
    }
  },

  revokeShare: async (id) => {
    const previous = get().sharesByMe;
    set((s) => ({ sharesByMe: s.sharesByMe.filter((share) => share.id !== id) }));
    try {
      await SharesApi.deleteShare(id);
    } catch (err) {
      console.error("Failed to revoke share", err);
      set({ sharesByMe: previous });
    }
  },

  setActiveNote: (id) => set({ activeNoteId: id, activeView: id ? "notes" : get().activeView }),

  setActiveView: (v) => set({ activeView: v, activeNoteId: v === "notes" ? get().activeNoteId : null }),

  toggleFolder: (id) =>
    set((s) => {
      const next = new Set(s.expandedFolders);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { expandedFolders: next };
    }),

  getChildFolders: (parentId) =>
    get()
      .folders.filter((f) => f.parentFolderId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder),

  getNotesInFolder: (folderId) =>
    get()
      .notes.filter((n) => n.parentFolderId === folderId && !n.deletedAt && !n.isArchived)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),

  getActiveNote: () => {
    const { activeNoteId, notes } = get();
    return activeNoteId ? notes.find((n) => n.id === activeNoteId) : undefined;
  },
}));
