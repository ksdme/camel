import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ease } from "@/lib/motion";
import { Clock, FileText, Folder as FolderIcon, Loader2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { listRecentNotes } from "@/lib/notes-api";
import type { WorkspaceNote } from "@/types/workspace";

const RECENT_LIMIT = 50;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk}w ago`;
  return new Date(iso).toLocaleDateString();
}

function groupLabel(iso: string): string {
  const now = new Date();
  const d = new Date(iso);
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.floor((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  if (days < 30) return "This month";
  return "Earlier";
}

const GROUP_ORDER = ["Today", "Yesterday", "This week", "This month", "Earlier"];

export function RecentPage() {
  const { folders, setActiveNote } = useWorkspaceStore(
    useShallow((s) => ({
      folders: s.folders,
      setActiveNote: s.setActiveNote,
    }))
  );

  const [recent, setRecent] = useState<WorkspaceNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listRecentNotes(RECENT_LIMIT)
      .then((notes) => {
        if (!cancelled) setRecent(notes);
      })
      .catch((err) => {
        console.error("Failed to load recent notes", err);
        if (!cancelled) setError("Couldn't load recent notes.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const folderName = useMemo(() => {
    const map = new Map<string, string>();
    folders.forEach((f) => map.set(f.id, f.name));
    return (id: string | null) => (id ? map.get(id) ?? "Unknown" : "Root");
  }, [folders]);

  const grouped = useMemo(() => {
    const map = new Map<string, WorkspaceNote[]>();
    for (const n of recent) {
      const label = groupLabel(n.updatedAt);
      const arr = map.get(label) ?? [];
      arr.push(n);
      map.set(label, arr);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
      label: g,
      items: map.get(g)!,
    }));
  }, [recent]);

  return (
    <motion.div
      key="recent"
      className="h-full overflow-y-auto"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={{ duration: 0.4, ease }}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 md:px-10 pt-6 sm:pt-8 pb-32 space-y-6 sm:space-y-8">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span className="text-label-xs uppercase tracking-wider">Recent</span>
          </div>
          <h1 className="font-serif text-h1 text-foreground">Recently updated</h1>
          <p className="text-body text-muted-foreground">
            Pick up where you left off — your latest notes across all folders.
          </p>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-meta">Loading recent notes…</span>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-10 text-center">
            <p className="text-body text-destructive font-medium">{error}</p>
          </div>
        ) : recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-body text-foreground font-medium">No recent activity</p>
            <p className="text-meta text-muted-foreground mt-1">
              Notes you create or edit will show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map((group) => (
              <section key={group.label} className="space-y-3">
                <h2 className="text-label-xs uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </h2>
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                    {group.items.map((note) => (
                      <motion.button
                        key={note.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, transition: { duration: 0.2 } }}
                        transition={{ duration: 0.3, ease }}
                        onClick={() => setActiveNote(note.id)}
                        className="group w-full text-left rounded-xl border border-border bg-card p-4 hover:border-foreground/20 hover:bg-sand-200/40 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-lg bg-sand-200 flex items-center justify-center shrink-0">
                            <FileText className="h-5 w-5 text-foreground/70" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-body font-medium text-foreground truncate">
                              {note.title}
                            </h3>
                            <div className="flex items-center gap-3 mt-1 text-meta text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <FolderIcon className="h-3 w-3" />
                                {folderName(note.parentFolderId)}
                              </span>
                              <span>·</span>
                              <span>{timeAgo(note.updatedAt)}</span>
                            </div>
                            {note.plainText && (
                              <p className="text-meta text-muted-foreground mt-2 line-clamp-1">
                                {note.plainText}
                              </p>
                            )}
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
