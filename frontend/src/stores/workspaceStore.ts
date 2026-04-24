import { create } from "zustand";
import type { WorkspaceFolder, WorkspaceNote } from "@/types/workspace";

function genId() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

// Seed data
const seedFolders: WorkspaceFolder[] = [
  { id: "f1", parentFolderId: null, name: "Projects", sortOrder: 0, createdAt: now(), updatedAt: now() },
  { id: "f2", parentFolderId: "f1", name: "Camel v1", sortOrder: 0, createdAt: now(), updatedAt: now() },
  { id: "f3", parentFolderId: "f1", name: "Research", sortOrder: 1, createdAt: now(), updatedAt: now() },
  { id: "f4", parentFolderId: null, name: "Personal", sortOrder: 1, createdAt: now(), updatedAt: now() },
  { id: "f5", parentFolderId: "f4", name: "Journal", sortOrder: 0, createdAt: now(), updatedAt: now() },
  { id: "f6", parentFolderId: null, name: "Archive", sortOrder: 2, createdAt: now(), updatedAt: now() },
];

const seedNotes: WorkspaceNote[] = [
  { id: "n1", parentFolderId: "f2", title: "Getting Started", documentJson: null, plainText: "", createdAt: now(), updatedAt: now() },
  { id: "n2", parentFolderId: "f2", title: "Architecture Notes", documentJson: null, plainText: "", createdAt: now(), updatedAt: now() },
  { id: "n3", parentFolderId: "f3", title: "Competitor Analysis", documentJson: null, plainText: "", createdAt: now(), updatedAt: now() },
  { id: "n4", parentFolderId: "f5", title: "Week 1 Reflections", documentJson: null, plainText: "", createdAt: now(), updatedAt: now() },
];

interface WorkspaceState {
  folders: WorkspaceFolder[];
  notes: WorkspaceNote[];
  activeNoteId: string | null;
  expandedFolders: Set<string>;
  activeView: "notes" | "music" | "settings";

  // Folder ops
  createFolder: (name: string, parentFolderId: string | null) => string;
  renameFolder: (id: string, name: string) => void;
  moveFolder: (id: string, newParentId: string | null) => void;
  deleteFolder: (id: string) => void;

  // Note ops
  createNote: (title: string, parentFolderId: string | null) => string;
  renameNote: (id: string, title: string) => void;
  moveNote: (id: string, newFolderId: string | null) => void;
  deleteNote: (id: string) => void;
  updateNoteContent: (id: string, documentJson: any, plainText: string) => void;

  // Navigation
  setActiveNote: (id: string | null) => void;
  toggleFolder: (id: string) => void;
  setActiveView: (v: "notes" | "music" | "settings") => void;

  // Helpers
  getChildFolders: (parentId: string | null) => WorkspaceFolder[];
  getNotesInFolder: (folderId: string | null) => WorkspaceNote[];
  getActiveNote: () => WorkspaceNote | undefined;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  folders: seedFolders,
  notes: seedNotes,
  activeNoteId: null,
  expandedFolders: new Set(["f1", "f4"]),
  activeView: "notes",

  createFolder: (name, parentFolderId) => {
    const id = genId();
    const folder: WorkspaceFolder = {
      id,
      parentFolderId,
      name,
      sortOrder: get().folders.filter((f) => f.parentFolderId === parentFolderId).length,
      createdAt: now(),
      updatedAt: now(),
    };
    set((s) => ({ folders: [...s.folders, folder] }));
    return id;
  },

  renameFolder: (id, name) =>
    set((s) => ({
      folders: s.folders.map((f) => (f.id === id ? { ...f, name, updatedAt: now() } : f)),
    })),

  moveFolder: (id, newParentId) =>
    set((s) => ({
      folders: s.folders.map((f) =>
        f.id === id ? { ...f, parentFolderId: newParentId, updatedAt: now() } : f
      ),
    })),

  deleteFolder: (id) => {
    // Recursively collect all descendant folder IDs
    const allIds = new Set<string>();
    const collect = (fid: string) => {
      allIds.add(fid);
      get()
        .folders.filter((f) => f.parentFolderId === fid)
        .forEach((f) => collect(f.id));
    };
    collect(id);
    set((s) => ({
      folders: s.folders.filter((f) => !allIds.has(f.id)),
      notes: s.notes.filter((n) => !n.parentFolderId || !allIds.has(n.parentFolderId)),
      activeNoteId:
        s.activeNoteId && s.notes.find((n) => n.id === s.activeNoteId)?.parentFolderId &&
        allIds.has(s.notes.find((n) => n.id === s.activeNoteId)!.parentFolderId!)
          ? null
          : s.activeNoteId,
    }));
  },

  createNote: (title, parentFolderId) => {
    const id = genId();
    const note: WorkspaceNote = {
      id,
      parentFolderId,
      title,
      documentJson: null,
      plainText: "",
      createdAt: now(),
      updatedAt: now(),
    };
    set((s) => ({ notes: [...s.notes, note], activeNoteId: id }));
    return id;
  },

  renameNote: (id, title) =>
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, title, updatedAt: now() } : n)),
    })),

  moveNote: (id, newFolderId) =>
    set((s) => ({
      notes: s.notes.map((n) =>
        n.id === id ? { ...n, parentFolderId: newFolderId, updatedAt: now() } : n
      ),
    })),

  deleteNote: (id) =>
    set((s) => ({
      notes: s.notes.filter((n) => n.id !== id),
      activeNoteId: s.activeNoteId === id ? null : s.activeNoteId,
    })),

  updateNoteContent: (id, documentJson, plainText) =>
    set((s) => ({
      notes: s.notes.map((n) =>
        n.id === id ? { ...n, documentJson, plainText, updatedAt: now() } : n
      ),
    })),

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
    get().notes.filter((n) => n.parentFolderId === folderId),

  getActiveNote: () => {
    const { activeNoteId, notes } = get();
    return activeNoteId ? notes.find((n) => n.id === activeNoteId) : undefined;
  },
}));