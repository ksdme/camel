import { useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { Block } from "@blocknote/core";
import { MiniPlayer } from "@/components/MiniPlayer";

interface NoteEditorProps {
  noteId: string;
}

export function NoteEditor({ noteId }: NoteEditorProps) {
  const note = useWorkspaceStore((s) => s.notes.find((n) => n.id === noteId));
  const updateNoteContent = useWorkspaceStore((s) => s.updateNoteContent);
  const renameNote = useWorkspaceStore((s) => s.renameNote);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useCreateBlockNote(
    {
      initialContent: note?.documentJson || undefined,
    },
    [noteId]
  );

  const save = useCallback(() => {
    if (!editor) return;
    const blocks = editor.document;
    const plainText = blocks
      .map((b: Block) => {
        if ("content" in b && Array.isArray(b.content)) {
          return b.content
            .map((c: any) => (typeof c === "string" ? c : c.text || ""))
            .join("");
        }
        return "";
      })
      .join("\n");
    updateNoteContent(noteId, blocks, plainText);
  }, [editor, noteId, updateNoteContent]);

  // Debounced save on content change
  const handleChange = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(save, 2000);
  }, [save]);

  // Save on blur / unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      save();
    };
  }, [save]);

  if (!note) return null;

  return (
    <motion.div
      className="flex flex-col h-full"
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Floating mini-player — appears when a track is loaded */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        <MiniPlayer />
      </div>

      {/* Title */}
      <motion.div
        className="px-16 pt-12 pb-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      >
        <input
          value={note.title}
          onChange={(e) => renameNote(noteId, e.target.value)}
          className="w-full text-h1 font-semibold text-foreground bg-transparent border-none outline-none placeholder:text-muted-foreground"
          placeholder="Untitled"
        />
        <p className="text-meta text-muted-foreground mt-1">
          Last edited {new Date(note.updatedAt).toLocaleDateString()}
        </p>
      </motion.div>

      {/* Editor */}
      <motion.div
        className="flex-1 px-12 pb-12 overflow-y-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <BlockNoteView
          editor={editor}
          onChange={handleChange}
          theme="light"
        />
      </motion.div>
    </motion.div>
  );
}