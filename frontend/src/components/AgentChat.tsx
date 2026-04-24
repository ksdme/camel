import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, ChevronDown, Loader2, FilePlus, Pencil, RotateCcw, AlertCircle, Check, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/stores/chatStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { chatPanelVariants, messageBubble } from "@/lib/motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

import type { WorkspaceFolder } from "@/types/workspace";

const AGENT_RESPONSES = [
  "That's a great idea! Let me help you flesh it out. Consider breaking it into smaller, actionable steps — what's the first thing you'd want to tackle?",
  "Interesting thought. I'd suggest creating a new note for this and organizing it under a dedicated folder. Want me to help structure it?",
  "I can see a few angles here. Let me think about this... You could approach it from the user's perspective first, then work backwards to the technical requirements.",
  "Nice! This connects well with your other notes. Here's a suggestion: try mapping out the dependencies between your ideas to find the critical path.",
  "Love the energy. Here's a framework: **What** is the core problem? **Who** does it affect? **Why** now? Start there and the rest follows.",
];

function getAgentResponse(): string {
  return AGENT_RESPONSES[Math.floor(Math.random() * AGENT_RESPONSES.length)];
}

export function AgentChat() {
  const { messages, isOpen, isLoading, addMessage, editMessage, removeMessagesAfter, markError, setOpen, setLoading } =
    useChatStore();
  const { folders, createNote, setActiveNote } = useWorkspaceStore();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const sendToAgent = async (userText: string) => {
    setLoading(true);
    try {
      // Simulate agent delay (replace with real edge function when Cloud is enabled)
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));

      // Simulate random failure ~15% of the time for demo
      if (Math.random() < 0.15) throw new Error("Agent unavailable");

      addMessage("assistant", getAgentResponse());
    } catch {
      const errId = addMessage("assistant", "Sorry, I couldn't process that. Please try again.");
      markError(errId);
    }
    setLoading(false);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    addMessage("user", text);
    if (!isOpen) setOpen(true);
    await sendToAgent(text);
  };

  const handleRetry = async (msgId: string) => {
    // Find the user message before this failed assistant message
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx <= 0) return;
    const userMsg = messages[idx - 1];
    if (userMsg.role !== "user") return;

    // Remove the failed assistant message and resend
    removeMessagesAfter(userMsg.id);
    await sendToAgent(userMsg.content);
  };

  const handleEditSubmit = (msgId: string) => {
    const text = editText.trim();
    if (!text) return;
    editMessage(msgId, text);
    // Remove everything after this message and resend
    removeMessagesAfter(msgId);
    setEditingId(null);
    setEditText("");
    sendToAgent(text);
  };

  const handleSaveAsNote = (content: string, folderId: string | null) => {
    const title = content.length > 60 ? content.slice(0, 57) + "..." : content;
    const cleanTitle = title.replace(/[*#_`]/g, "").trim() || "Idea from Chat";
    const noteId = createNote(cleanTitle, folderId);
    setActiveNote(noteId);
    toast({
      title: "Note created",
      description: `Saved to ${folderId ? folders.find((f) => f.id === folderId)?.name || "folder" : "root"}`,
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 flex justify-center pointer-events-none z-30 pb-4 sm:pb-6 px-3 sm:px-4">
      <motion.div layout className="w-full max-w-[720px] pointer-events-auto max-sm:max-w-full">
        <AnimatePresence mode="wait">
          {isOpen && messages.length > 0 && (
            <motion.div
              key="chat-history"
              variants={chatPanelVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              className="mb-2"
            >
              <div className="bg-card border border-border rounded-xl shadow-lg overflow-hidden max-sm:rounded-lg">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-meta font-semibold text-foreground">Camel Agent</span>
                  </div>
                  <button onClick={() => setOpen(false)} className="p-1 rounded-md hover:bg-muted transition-colors">
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>

                {/* Messages */}
                <div ref={scrollRef} className="max-h-[240px] sm:max-h-[360px] overflow-y-auto p-3 sm:p-4 space-y-3">
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      variants={messageBubble}
                      initial="hidden"
                      animate="show"
                      className={`flex flex-col ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {/* User message with edit support */}
                      {msg.role === "user" ? (
                        <div className="flex items-end gap-1.5 self-end max-w-[85%]">
                          {editingId === msg.id ? (
                            <div className="flex-1 flex items-center gap-1.5 bg-primary/10 rounded-xl px-3 py-2">
                              <input
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleEditSubmit(msg.id);
                                  if (e.key === "Escape") {
                                    setEditingId(null);
                                    setEditText("");
                                  }
                                }}
                                className="flex-1 bg-transparent text-body text-foreground outline-none"
                                autoFocus
                              />
                              <button
                                onClick={() => handleEditSubmit(msg.id)}
                                className="p-1 rounded hover:bg-primary/20 text-primary"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingId(null);
                                  setEditText("");
                                }}
                                className="p-1 rounded hover:bg-muted text-muted-foreground"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setEditingId(msg.id);
                                  setEditText(msg.content);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted text-muted-foreground transition-opacity shrink-0"
                                title="Edit message"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <div className="bg-primary text-primary-foreground rounded-xl px-3.5 py-2.5 text-body">
                                <p className="m-0">{msg.content}</p>
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        /* Assistant message with save-to-note + error/retry */
                        <div className="max-w-[85%] self-start">
                          <div
                            className={`rounded-xl px-3.5 py-2.5 text-body ${
                              msg.error
                                ? "bg-destructive/10 text-destructive border border-destructive/20"
                                : "bg-muted text-foreground"
                            }`}
                          >
                            {msg.error ? (
                              <div className="flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <span>{msg.content}</span>
                              </div>
                            ) : (
                              <div className="prose prose-sm max-w-none [&>p]:m-0">
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                              </div>
                            )}
                          </div>
                          {/* Action bar */}
                          <div className="flex items-center gap-1 mt-1 ml-1">
                            {msg.error ? (
                              <button
                                onClick={() => handleRetry(msg.id)}
                                disabled={isLoading}
                                className="flex items-center gap-1 text-meta text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                              >
                                <RotateCcw className="h-3 w-3" />
                                <span>Retry</span>
                              </button>
                            ) : (
                              <SaveToNoteButton content={msg.content} folders={folders} onSave={handleSaveAsNote} />
                            )}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ))}

                  {isLoading && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                      <div className="bg-muted rounded-xl px-4 py-3 flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        <span className="text-meta text-muted-foreground">Thinking...</span>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Bar — always visible */}
        <motion.div layout className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
          <div className="flex items-end gap-2 p-2.5 sm:p-3">
            <div className="flex items-center gap-2 pl-0.5 pb-1">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
            </div>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (messages.length > 0) setOpen(true);
              }}
              placeholder="Capture an idea, ask your agent..."
              rows={1}
              className="flex-1 resize-none bg-transparent text-body text-foreground placeholder:text-muted-foreground outline-none min-h-[24px] max-h-[80px] sm:max-h-[120px] py-1"
              style={{ fieldSizing: "content" } as any}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="h-8 w-8 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
          {messages.length === 0 && <div className="px-3 sm:px-4 pb-2 sm:pb-2.5 -mt-1"></div>}
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ── Save to Note dropdown ── */
function SaveToNoteButton({
  content,
  folders,
  onSave,
}: {
  content: string;
  folders: WorkspaceFolder[];
  onSave: (content: string, folderId: string | null) => void;
}) {
  const rootFolders = folders.filter((f) => f.parentFolderId === null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 text-meta text-primary hover:text-primary/80 transition-colors">
          <FilePlus className="h-3 w-3" />
          <span>Save as note</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem onClick={() => onSave(content, null)}>
          <FilePlus className="h-4 w-4 mr-2" />
          Root (no folder)
        </DropdownMenuItem>
        {rootFolders.map((f) => (
          <DropdownMenuItem key={f.id} onClick={() => onSave(content, f.id)}>
            <FilePlus className="h-4 w-4 mr-2" />
            {f.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
