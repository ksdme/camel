import { NoteEditor } from "@/components/NoteEditor";
import { AgentChat } from "@/components/AgentChat";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { motion, AnimatePresence } from "framer-motion";
import { ease } from "@/lib/motion";
import { SketchShowcase } from "@/components/SketchShowcase";
import { SettingsPage } from "@/pages/SettingsPage";
import { RecentPage } from "@/pages/RecentPage";
import { SharedPage } from "@/pages/SharedPage";

const Index = () => {
  const activeNoteId = useWorkspaceStore((s) => s.activeNoteId);
  const activeView = useWorkspaceStore((s) => s.activeView);

  return (
    <motion.div
      className="min-h-full overflow-hidden relative"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease }}
    >
      <AnimatePresence mode="wait">
        {activeView === "settings" ? (
          <SettingsPage key="settings" />
        ) : activeView === "recent" ? (
          <RecentPage key="recent" />
        ) : activeView === "shared" ? (
          <SharedPage key="shared" />
        ) : activeNoteId ? (
          <NoteEditor key={activeNoteId} noteId={activeNoteId} />
        ) : (
          <motion.div
            key="empty-state"
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.4, ease }}
          >
            <div className="h-full overflow-y-auto">
              <div className="px-6 sm:px-10 pt-6 pb-40 space-y-8">
                <SketchShowcase />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AgentChat />
    </motion.div>
  );
};

export default Index;
