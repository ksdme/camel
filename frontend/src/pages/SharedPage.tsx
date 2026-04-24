import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import { ease } from "@/lib/motion";
import {
  Users,
  FileText,
  Folder,
  Mail,
  ExternalLink,
  Eye,
  Pencil,
  Search,
  ShieldOff,
  Loader2,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ShareDialog } from "@/components/ShareDialog";
import { toast } from "@/hooks/use-toast";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type {
  ShareAccessLevel,
  ShareKind,
  WorkspaceShare,
} from "@/types/workspace";

interface GroupedShare {
  key: string;
  kind: ShareKind;
  targetId: string;
  targetTitle: string;
  sharedAt: string;
  shares: WorkspaceShare[];
}

function recipientLabel(email: string): string {
  return email || "Link share";
}

function recipientInitials(email: string): string {
  if (!email) return "LN";
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return email.slice(0, 2).toUpperCase();
  return parts
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function shareLink(token: string): string {
  if (typeof window === "undefined") return `/s/${token}`;
  return `${window.location.origin}/s/${token}`;
}

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
  return new Date(iso).toLocaleDateString();
}

function groupShares(shares: WorkspaceShare[]): GroupedShare[] {
  const map = new Map<string, GroupedShare>();
  for (const s of shares) {
    const key = `${s.kind}:${s.targetId}`;
    const existing = map.get(key);
    if (existing) {
      existing.shares.push(s);
      if (new Date(s.createdAt) < new Date(existing.sharedAt)) {
        existing.sharedAt = s.createdAt;
      }
    } else {
      map.set(key, {
        key,
        kind: s.kind,
        targetId: s.targetId,
        targetTitle: s.targetTitle,
        sharedAt: s.createdAt,
        shares: [s],
      });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime()
  );
}

export function SharedPage() {
  const {
    notes,
    folders,
    sharesByMe,
    sharesWithMe,
    sharesByMeHydrated,
    sharesByMeLoading,
    sharesWithMeHydrated,
    sharesWithMeLoading,
    hydrateSharesByMe,
    hydrateSharesWithMe,
    createShare,
    updateShareAccess,
    revokeShare,
    shareDialogOpen,
    shareDialogKind,
    shareDialogTargetId,
    closeShareDialog,
  } = useWorkspaceStore(
    useShallow((s) => ({
      notes: s.notes,
      folders: s.folders,
      sharesByMe: s.sharesByMe,
      sharesWithMe: s.sharesWithMe,
      sharesByMeHydrated: s.sharesByMeHydrated,
      sharesByMeLoading: s.sharesByMeLoading,
      sharesWithMeHydrated: s.sharesWithMeHydrated,
      sharesWithMeLoading: s.sharesWithMeLoading,
      hydrateSharesByMe: s.hydrateSharesByMe,
      hydrateSharesWithMe: s.hydrateSharesWithMe,
      createShare: s.createShare,
      updateShareAccess: s.updateShareAccess,
      revokeShare: s.revokeShare,
      shareDialogOpen: s.shareDialogOpen,
      shareDialogKind: s.shareDialogKind,
      shareDialogTargetId: s.shareDialogTargetId,
      closeShareDialog: s.closeShareDialog,
    }))
  );

  const [query, setQuery] = useState("");

  useEffect(() => {
    void hydrateSharesByMe();
    void hydrateSharesWithMe();
  }, [hydrateSharesByMe, hydrateSharesWithMe]);

  const groupedByMe = useMemo(() => groupShares(sharesByMe), [sharesByMe]);

  const filteredByMe = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groupedByMe;
    return groupedByMe.filter((g) => {
      if (g.targetTitle.toLowerCase().includes(q)) return true;
      return g.shares.some((s) => s.recipientEmail.toLowerCase().includes(q));
    });
  }, [groupedByMe, query]);

  const shareTargets = useMemo(
    () => [
      ...notes
        .filter((n) => !n.deletedAt && !n.isArchived)
        .map((n) => ({ id: n.id, label: n.title || "Untitled", kind: "note" as const })),
      ...folders.map((f) => ({ id: f.id, label: f.name, kind: "folder" as const })),
    ],
    [notes, folders],
  );

  const handleRevokeGroup = async (group: GroupedShare) => {
    await Promise.all(group.shares.map((s) => revokeShare(s.id)));
    toast({
      title: "Access revoked",
      description: `"${group.targetTitle}" is no longer shared.`,
    });
  };

  const handleToggleAccess = (share: WorkspaceShare) => {
    const next: ShareAccessLevel = share.accessLevel === "edit" ? "view" : "edit";
    void updateShareAccess(share.id, next);
  };

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(shareLink(token));
      toast({ title: "Link copied" });
    } catch {
      toast({ title: "Couldn't copy link", variant: "destructive" });
    }
  };

  return (
    <motion.div
      key="shared"
      className="h-full overflow-y-auto"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={{ duration: 0.4, ease }}
    >
      <div className="max-w-4xl mx-auto px-6 sm:px-10 pt-8 pb-32 space-y-8">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span className="text-label-xs uppercase tracking-wider">Shared</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-serif text-h1 text-foreground">Shared with external users</h1>
              <p className="text-body text-muted-foreground mt-1">
                Notes and folders you've shared outside your workspace. Manage access or revoke links.
              </p>
            </div>
            <ShareDialog
              targets={shareTargets}
              createShare={createShare}
              open={shareDialogOpen}
              onOpenChange={(open) => {
                if (!open) closeShareDialog();
              }}
              defaultKind={shareDialogKind ?? "note"}
              defaultTargetId={shareDialogTargetId ?? undefined}
            />
          </div>
        </header>

        <Tabs defaultValue="by-me" className="w-full">
          <TabsList>
            <TabsTrigger value="by-me">Shared by me</TabsTrigger>
            <TabsTrigger value="with-me">Shared with me</TabsTrigger>
          </TabsList>

          <TabsContent value="by-me" className="mt-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by title or shared-with email…"
                className="pl-9 h-10 bg-card"
                aria-label="Filter shared items"
              />
            </div>

            {!sharesByMeHydrated && sharesByMeLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-meta">Loading shares…</span>
              </div>
            ) : filteredByMe.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center">
                <Search className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                <p className="text-body text-foreground font-medium">
                  {groupedByMe.length === 0 ? "No shared items" : "No matches"}
                </p>
                <p className="text-meta text-muted-foreground mt-1">
                  {groupedByMe.length === 0
                    ? "Click Share to invite someone to a note or folder."
                    : "Try a different title or email."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {filteredByMe.map((group) => (
                    <motion.div
                      key={group.key}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{
                        opacity: 0,
                        height: 0,
                        marginTop: 0,
                        transition: { duration: 0.25, ease },
                      }}
                      transition={{ duration: 0.3, ease }}
                      className="group rounded-xl border border-border bg-card p-4 hover:border-foreground/20 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-sand-200 flex items-center justify-center shrink-0">
                          {group.kind === "folder" ? (
                            <Folder className="h-5 w-5 text-foreground/70" />
                          ) : (
                            <FileText className="h-5 w-5 text-foreground/70" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-body font-medium text-foreground truncate">
                              {group.targetTitle}
                            </h3>
                            <Badge variant="secondary" className="text-meta">
                              {group.kind}
                            </Badge>
                          </div>
                          <p className="text-meta text-muted-foreground mt-0.5">
                            Shared {timeAgo(group.sharedAt)} · {group.shares.length}{" "}
                            {group.shares.length === 1 ? "person" : "people"}
                          </p>

                          <div className="flex items-center gap-3 mt-3 flex-wrap">
                            <div className="flex -space-x-2">
                              {group.shares.slice(0, 4).map((s) => (
                                <Avatar
                                  key={s.id}
                                  className="h-7 w-7 border-2 border-card"
                                  title={recipientLabel(s.recipientEmail)}
                                >
                                  <AvatarFallback className="text-meta bg-sand-300 text-foreground">
                                    {recipientInitials(s.recipientEmail)}
                                  </AvatarFallback>
                                </Avatar>
                              ))}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {group.shares.map((s) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => handleToggleAccess(s)}
                                  title={`Click to toggle to ${
                                    s.accessLevel === "edit" ? "view" : "edit"
                                  }`}
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-meta font-normal hover:border-foreground/40 transition-colors"
                                >
                                  <Mail className="h-3 w-3" />
                                  {recipientLabel(s.recipientEmail)}
                                  {s.accessLevel === "edit" ? (
                                    <Pencil className="h-3 w-3 ml-0.5 text-foreground/60" />
                                  ) : (
                                    <Eye className="h-3 w-3 ml-0.5 text-foreground/60" />
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void copyLink(group.shares[0].token)}
                            className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            Copy link
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <ShieldOff className="h-3.5 w-3.5 mr-1.5" />
                                Revoke
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Revoke access?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will immediately revoke external access to{" "}
                                  <span className="font-medium text-foreground">
                                    {group.targetTitle}
                                  </span>
                                  . The shared links will stop working for {group.shares.length}{" "}
                                  {group.shares.length === 1 ? "person" : "people"}.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => void handleRevokeGroup(group)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Revoke access
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </TabsContent>

          <TabsContent value="with-me" className="mt-6 space-y-3">
            {!sharesWithMeHydrated && sharesWithMeLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-meta">Loading…</span>
              </div>
            ) : sharesWithMe.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center">
                <Users className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                <p className="text-body text-foreground font-medium">Nothing shared with you yet</p>
                <p className="text-meta text-muted-foreground mt-1">
                  When external collaborators share notes or folders, they'll appear here.
                </p>
              </div>
            ) : (
              sharesWithMe.map((share) => (
                <motion.div
                  key={share.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease }}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-sand-200 flex items-center justify-center shrink-0">
                      {share.kind === "folder" ? (
                        <Folder className="h-5 w-5 text-foreground/70" />
                      ) : (
                        <FileText className="h-5 w-5 text-foreground/70" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-body font-medium text-foreground truncate">
                          {share.targetTitle}
                        </h3>
                        <Badge variant="secondary" className="text-meta">
                          {share.kind}
                        </Badge>
                        <Badge variant="outline" className="text-meta gap-1 font-normal">
                          {share.accessLevel === "edit" ? (
                            <Pencil className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                          {share.accessLevel}
                        </Badge>
                      </div>
                      <p className="text-meta text-muted-foreground mt-0.5">
                        Shared {timeAgo(share.createdAt)}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => void copyLink(share.token)}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Copy link
                    </Button>
                  </div>
                </motion.div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </motion.div>
  );
}
