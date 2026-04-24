import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Check, Hash, Tag as TagIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { WorkspaceTag } from "@/types/workspace";
import { cn } from "@/lib/utils";

export const TAG_PALETTE = [
  "#14b8a6",
  "#0ea5e9",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#ef4444",
  "#f59e0b",
  "#84cc16",
  "#10b981",
  "#64748b",
] as const;

const FALLBACK_COLOR = "#64748b";

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

interface ChipProps {
  tag: WorkspaceTag;
  onRemove?: () => void;
  interactive?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

function TagChip({ tag, onRemove, interactive, selected, onClick }: ChipProps) {
  const color = tag.color ?? FALLBACK_COLOR;
  const rgb = useMemo(() => hexToRgb(color), [color]);
  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      onClick={onClick}
      className={cn(
        "group inline-flex items-center gap-1 pl-1.5 pr-1.5 h-6 rounded-full text-xs font-medium",
        "border transition-colors select-none",
        interactive && "cursor-pointer hover:brightness-95",
        selected && "ring-2 ring-offset-1 ring-offset-background"
      )}
      style={{
        backgroundColor: `rgba(${rgb}, 0.12)`,
        color,
        borderColor: `rgba(${rgb}, 0.32)`,
        ...(selected ? ({ "--tw-ring-color": color } as React.CSSProperties) : {}),
      }}
    >
      <Hash className="w-3 h-3 opacity-70" />
      <span className="leading-none">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 transition-colors"
          aria-label={`Remove ${tag.name}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
      {interactive && selected && !onRemove && <Check className="w-3 h-3 ml-0.5" />}
    </motion.span>
  );
}

interface TagChipsProps {
  noteId: string;
}

export function TagChips({ noteId }: TagChipsProps) {
  const tags = useWorkspaceStore((s) => s.tags);
  const assigned = useWorkspaceStore(
    (s) => s.notes.find((n) => n.id === noteId)?.tags ?? []
  );
  const setNoteTags = useWorkspaceStore((s) => s.setNoteTags);
  const createTag = useWorkspaceStore((s) => s.createTag);

  const assignedIds = useMemo(() => new Set(assigned.map((t) => t.id)), [assigned]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pickedColor, setPickedColor] = useState<string>(TAG_PALETTE[0]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => tags.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 20),
    [tags, q]
  );
  const exactMatch = tags.some((t) => t.name.toLowerCase() === q);
  const canCreate = q.length > 0 && !exactMatch;

  const replaceAssigned = (ids: string[]) => {
    setNoteTags(noteId, Array.from(new Set(ids)));
  };

  const toggle = (tagId: string) => {
    const current = assigned.map((t) => t.id);
    const next = assignedIds.has(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    replaceAssigned(next);
  };

  const remove = (tagId: string) => {
    replaceAssigned(assigned.map((t) => t.id).filter((id) => id !== tagId));
  };

  const handleCreate = () => {
    if (!canCreate) return;
    const newId = createTag(query.trim(), pickedColor);
    if (!newId) return;
    replaceAssigned([...assigned.map((t) => t.id), newId]);
    setQuery("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <AnimatePresence mode="popLayout" initial={false}>
        {assigned.map((tag) => (
          <TagChip key={tag.id} tag={tag} onRemove={() => remove(tag.id)} />
        ))}
      </AnimatePresence>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <motion.button
            layout
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            type="button"
            className={cn(
              "inline-flex items-center gap-1 h-6 px-2 rounded-full text-xs font-medium",
              "border border-dashed border-border text-muted-foreground",
              "hover:text-foreground hover:border-foreground/40 transition-colors"
            )}
          >
            <Plus className="w-3 h-3" />
            {assigned.length === 0 ? "Add tag" : "Tag"}
          </motion.button>
        </PopoverTrigger>

        <PopoverContent align="start" sideOffset={8} className="w-72 p-0 overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <TagIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canCreate) {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
                placeholder="Search or create tag…"
                className="w-full h-8 pl-8 pr-2 text-sm bg-transparent rounded-md border border-input focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <AnimatePresence initial={false}>
              {canCreate && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-3 px-1 pb-1 flex items-center gap-2.5 flex-wrap">
                    {TAG_PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setPickedColor(c)}
                        className={cn(
                          "w-5 h-5 rounded-full transition-all shrink-0",
                          pickedColor === c
                            ? "ring-2 ring-offset-1 ring-offset-popover"
                            : "hover:scale-110"
                        )}
                        style={{
                          backgroundColor: c,
                          ...(pickedColor === c ? ({ "--tw-ring-color": c } as React.CSSProperties) : {}),
                        }}
                        aria-label={`Color ${c}`}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="max-h-56 overflow-y-auto p-1.5">
            {filtered.length === 0 && !canCreate && (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                No tags yet — type to create one
              </div>
            )}
            {filtered.map((t) => {
              const selected = assignedIds.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t.id)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm",
                    "hover:bg-accent/50 transition-colors"
                  )}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: t.color ?? FALLBACK_COLOR }}
                    />
                    <span className="truncate text-foreground">{t.name}</span>
                  </span>
                  {selected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                </button>
              );
            })}

            {canCreate && (
              <button
                type="button"
                onClick={handleCreate}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent/50 transition-colors mt-1 border-t border-border pt-2"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: pickedColor }}
                />
                <span className="text-muted-foreground">Create</span>
                <span className="font-medium text-foreground">#{query.trim()}</span>
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
