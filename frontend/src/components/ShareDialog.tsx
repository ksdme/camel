import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { copyToClipboard } from "@/lib/utils";
import type { ShareAccessLevel, ShareKind, WorkspaceShare } from "@/types/workspace";

export interface ShareDialogTarget {
  id: string;
  label: string;
  kind: ShareKind;
}

interface ShareDialogProps {
  targets: ShareDialogTarget[];
  createShare: (args: {
    kind: ShareKind;
    targetId: string;
    recipientEmail: string;
    accessLevel: ShareAccessLevel;
  }) => Promise<WorkspaceShare | null>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultKind?: ShareKind;
  defaultTargetId?: string;
}

export function ShareDialog({
  targets,
  createShare,
  open: controlledOpen,
  onOpenChange,
  defaultKind,
  defaultTargetId,
}: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const visible = isControlled ? controlledOpen : open;
  const [kind, setKind] = useState<ShareKind>(defaultKind ?? "note");
  const [accessLevel, setAccessLevel] = useState<ShareAccessLevel>("view");
  const [targetId, setTargetId] = useState<string>(defaultTargetId ?? "");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const targetOptions = useMemo(
    () => targets.filter((target) => target.kind === kind),
    [kind, targets],
  );

  useEffect(() => {
    if (!visible) return;
    const preferredKind = defaultKind ?? kind;
    setKind(preferredKind);
  }, [visible, defaultKind, kind]);

  useEffect(() => {
    if (targetOptions.length === 0) {
      setTargetId("");
      return;
    }
    if (defaultTargetId && targetOptions.some((target) => target.id === defaultTargetId)) {
      setTargetId(defaultTargetId);
      return;
    }
    if (!targetOptions.some((target) => target.id === targetId)) {
      setTargetId(targetOptions[0].id);
    }
  }, [targetOptions, targetId, defaultTargetId]);

  const handleCreate = async () => {
    if (!targetId) return;
    setSubmitting(true);

    try {
      const share = await createShare({
        kind,
        targetId,
        recipientEmail: recipientEmail.trim(),
        accessLevel,
      });

      if (!share) {
        toast({ title: "Unable to create share", description: "Please try again." });
        return;
      }

      const link = `${window.location.origin}/s/${share.token}`;
      const ok = await copyToClipboard(link);
      if (ok) {
        toast({ title: "Share link copied", description: "The link is ready to paste." });
      } else {
        toast({
          title: "Share created",
          description: "Copy the link from the share list after closing.",
        });
      }

      if (isControlled) {
        onOpenChange?.(false);
      } else {
        setOpen(false);
      }
      setRecipientEmail("");
    } catch (err) {
      console.error(err);
      toast({ title: "Unable to share", description: "Please try again later." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={visible}
      onOpenChange={(nextOpen) => {
        if (isControlled) {
          onOpenChange?.(nextOpen);
        } else {
          setOpen(nextOpen);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="shrink-0">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share a note or folder</DialogTitle>
          <DialogDescription>Create a new share link. Email is optional for public link sharing.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-meta font-medium text-foreground">Kind</label>
              <Select value={kind} onValueChange={(value: string) => setKind(value as ShareKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="folder">Folder</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-meta font-medium text-foreground">Access</label>
              <Select value={accessLevel} onValueChange={(value: string) => setAccessLevel(value as ShareAccessLevel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">View</SelectItem>
                  <SelectItem value="edit">Edit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-meta font-medium text-foreground">{kind === "note" ? "Note" : "Folder"}</label>
            <Select value={targetId} onValueChange={setTargetId} disabled={targetOptions.length === 0}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    targetOptions.length === 0 ? `No ${kind}s available` : "Choose…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {targetOptions.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Input
              type="email"
              value={recipientEmail}
              onChange={(event) => setRecipientEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              if (isControlled) {
                onOpenChange?.(false);
              } else {
                setOpen(false);
              }
            }}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={submitting || !targetId}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
            Share
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
