import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileText, Folder } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";

type ShareKindLocal = "note" | "folder";
type ShareAccessLevelLocal = "view" | "edit";

interface ShareTokenResponse {
  id: string;
  ownerId: string;
  kind: ShareKindLocal;
  targetId: string;
  targetTitle: string;
  recipientEmail: string;
  targetContent?: string;
  targetPlainText?: string;
  accessLevel: ShareAccessLevelLocal;
  token: string;
  createdAt: string;
  updatedAt: string;
}

const iconForKind = (kind: ShareKindLocal) =>
  kind === "folder" ? <Folder className="h-5 w-5" /> : <FileText className="h-5 w-5" />;

const ShareLandingPage = () => {
  const { token } = useParams<{ token: string }>();
  const [share, setShare] = useState<ShareTokenResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const editor = useCreateBlockNote({
    initialContent: share?.targetContent ? JSON.parse(share.targetContent) : undefined,
    editable: share?.accessLevel === "edit",
  }, [share?.targetContent]);

  const handleChange = useCallback(async () => {
    if (!editor || share?.accessLevel !== "edit" || !token) return;
    const blocks = editor.document;
    const plainText = blocks
      .map((b: any) => {
        if ("content" in b && Array.isArray(b.content)) {
          return b.content
            .map((c: any) => (typeof c === "string" ? c : c.text || ""))
            .join("");
        }
        return "";
      })
      .join("\n");
    try {
      await apiFetch(`/shares/by-token/${encodeURIComponent(token)}/note`, {
        method: "PATCH",
        body: JSON.stringify({ content: JSON.stringify(blocks), plainText }),
        skipAuthRefresh: true,
      });
    } catch (err) {
      console.error("Failed to save shared note", err);
    }
  }, [editor, share?.accessLevel, token]);

  useEffect(() => {
    if (!token) {
      setError("Invalid share link.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    apiFetch<ShareTokenResponse>(`/shares/by-token/${encodeURIComponent(token)}`, {
      method: "GET",
      skipAuthRefresh: true,
    })
      .then((data) => {
        setShare(data);
        setLoading(false);
      })
      .catch((err) => {
        const message =
          err instanceof ApiError
            ? err.message
            : "Unable to load shared item. Please check the link and try again.";
        setError(message);
        setLoading(false);
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>{loading ? "Loading shared item…" : error ? "Share link not found" : "Shared item details"}</CardTitle>
            <CardDescription>
              {loading
                ? "Checking the shared URL." 
                : error
                ? error
                : "This share link was created for an external recipient."
              }
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="space-y-4 py-10 text-center">
                <p className="text-sm text-muted-foreground">If the share link was revoked or expired, it will no longer work.</p>
                <Link to="/">
                  <Button variant="secondary">Return to home</Button>
                </Link>
              </div>
            ) : share ? (
              share.kind === "note" && share.targetContent ? (
                <motion.div
                  className="flex flex-col h-full"
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="absolute top-3 right-3 z-30 pointer-events-none">
                    <Badge variant="secondary">shareview</Badge>
                  </div>

                  <motion.div
                    className="px-16 pt-12 pb-4"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <h1 className="w-full text-h1 font-semibold text-foreground">
                      {share.targetTitle}
                    </h1>
                    <p className="text-meta text-muted-foreground mt-1">
                      Shared {new Date(share.createdAt).toLocaleDateString()}
                    </p>
                  </motion.div>

                  <motion.div
                    className="flex-1 px-12 pb-12 overflow-y-auto"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <BlockNoteView editor={editor} editable={share?.accessLevel === "edit"} onChange={handleChange} theme="light" />
                  </motion.div>
                </motion.div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        {iconForKind(share.kind)}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{share.targetTitle}</p>
                        <p className="text-sm text-muted-foreground">
                          {share.recipientEmail ? `Shared with ${share.recipientEmail}` : "Shared via link"}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="uppercase tracking-[0.16em]">
                      {share.accessLevel}
                    </Badge>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border bg-card p-5">
                      <p className="text-sm text-muted-foreground">Item type</p>
                      <p className="mt-2 text-base font-medium text-foreground">{share.kind}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-card p-5">
                      <p className="text-sm text-muted-foreground">Access level</p>
                      <p className="mt-2 text-base font-medium text-foreground">{share.accessLevel}</p>
                    </div>
                  </div>

                  {share.kind === "note" && share.targetPlainText ? (
                    <div className="rounded-2xl border border-border bg-card p-5">
                      <p className="text-sm text-muted-foreground">Note preview</p>
                      <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{share.targetPlainText}</pre>
                    </div>
                  ) : null}

                  <div className="rounded-2xl border border-border bg-card p-5">
                    <p className="text-sm text-muted-foreground">How to access</p>
                    <p className="mt-2 text-base font-medium text-foreground">
                      {share.recipientEmail
                        ? "Open Camel and sign in with your account to view the shared item."
                        : "Anyone with this link can open the shared item. Sign in to access it."}
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <Link to="/">
                      <Button variant="secondary">Open Camel</Button>
                    </Link>
                    <Button asChild>
                      <Link to="/">Sign in</Link>
                    </Button>
                  </div>
                </div>
              )
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ShareLandingPage;
