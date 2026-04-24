import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Settings as SettingsIcon,
  Music2,
  Check,
  Plug,
  User,
  Shield,
  Cable,
  Camera,
  Key,
  Smartphone,
  LogOut,
  Trash2,
  Mail,
  Github,
  Slack,
  Activity,
  CheckCircle2,
  XCircle,
  LogIn,
  ShieldCheck,
  Search,
  Globe,
  Monitor,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTheme } from "@/hooks/use-theme";
import { useMusicStore, type Provider } from "@/stores/musicStore";
import { useAuthStore } from "@/stores/authStore";
import * as AuthApi from "@/lib/auth-api";
import { ApiError } from "@/lib/api";
import { ease, staggerContainer, staggerItem } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type SectionId = "account" | "security" | "integrations";

const NAV: { id: SectionId; label: string; icon: typeof User; desc: string }[] = [
  { id: "account", label: "Account", icon: User, desc: "Profile and appearance" },
  { id: "security", label: "Security", icon: Shield, desc: "Password and sessions" },
  { id: "integrations", label: "Integrations", icon: Cable, desc: "Connected services" },
];

export function SettingsPage() {
  const [active, setActive] = useState<SectionId>("account");

  return (
    <motion.div
      className="h-full overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease }}
    >
      <div className="px-6 sm:px-10 pt-8 pb-40 max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
          className="mb-8"
        >
          <h1 className="text-h1 font-semibold tracking-tight flex items-center gap-2">
            <SettingsIcon className="h-7 w-7 text-primary" />
            Settings
          </h1>
          <p className="text-body text-muted-foreground mt-1">
            Manage your account, security, and connected services.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8">
          {/* Sidebar nav */}
          <nav className="md:sticky md:top-8 md:self-start space-y-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActive(item.id)}
                  className={cn(
                    "relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="settings-nav-pill"
                      className="absolute inset-0 bg-accent rounded-lg"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <Icon className={cn("h-4 w-4 relative z-10", isActive && "text-accent-foreground")} />
                  <div className="relative z-10 min-w-0">
                    <div className={cn("text-sm font-medium", isActive && "text-accent-foreground")}>
                      {item.label}
                    </div>
                    <div className={cn("text-xs", isActive ? "text-accent-foreground/70" : "text-muted-foreground")}>
                      {item.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <div className="min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25, ease }}
              >
                {active === "account" && <AccountSection />}
                {active === "security" && <SecuritySection />}
                {active === "integrations" && <IntegrationsSection />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* -------------------- Account -------------------- */

function AccountSection() {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const signOut = useAuthStore((s) => s.signOut);

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");
    setEmail(user?.email ?? "");
  }, [user?.displayName, user?.email]);

  const saveProfile = useMutation({
    mutationFn: (payload: AuthApi.UpdateProfileRequest) => AuthApi.updateProfile(payload),
    onSuccess: (resp) => {
      if (user) {
        setUser({ ...user, email: resp.email, displayName: resp.displayName });
      }
      toast.success("Profile saved");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to save profile");
    },
  });

  const handleSave = () => {
    const payload: AuthApi.UpdateProfileRequest = {
      displayName: displayName.trim() === "" ? null : displayName.trim(),
      email: email.trim() === "" ? null : email.trim(),
    };
    saveProfile.mutate(payload);
  };

  const handleRemoveEmail = () => {
    setEmail("");
    saveProfile.mutate({ email: null });
  };

  const handleSignOut = async () => {
    await signOut();
    queryClient.clear();
    navigate("/login", { replace: true });
  };

  const avatarLetters = useMemo(() => {
    const base = displayName.trim() || user?.username || "CA";
    return base.slice(0, 2).toUpperCase();
  }, [displayName, user?.username]);

  return (
    <div className="space-y-6">
      <SectionHeader title="Account" description="Your profile information and appearance preferences." />

      <Card>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                {avatarLetters}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm hover:bg-primary/90 transition-colors"
              aria-label="Change avatar"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-w-0">
            <div className="text-body font-medium">{displayName || user?.username || "—"}</div>
            <div className="text-meta text-muted-foreground truncate">
              @{user?.username ?? "—"}
              {email && ` · ${email}`}
            </div>
          </div>
        </div>

        <Separator className="my-5" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Username" id="username">
            <Input id="username" value={user?.username ?? ""} disabled readOnly />
          </Field>
          <Field label="Display name" id="name">
            <Input
              id="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How Camel addresses you"
            />
          </Field>
          <Field label="Email (optional)" id="email">
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <div className="flex items-end">
            <p className="text-meta text-muted-foreground">
              Email is optional. You sign in with your username.
            </p>
          </div>
        </div>

        <div className="flex justify-between items-center gap-2 mt-5">
          {user?.email ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemoveEmail}
              disabled={saveProfile.isPending}
            >
              Remove email
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={handleSave} disabled={saveProfile.isPending}>
            {saveProfile.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </Card>

      <Card>
        <RowHeader title="Appearance" description="Switch between light and dark themes." />
        <div className="flex items-center justify-between mt-3">
          <div className="text-body">Dark mode</div>
          <Switch checked={theme === "dark"} onCheckedChange={(v) => setTheme(v ? "dark" : "light")} />
        </div>
      </Card>

      <DangerZoneCard onSignOut={handleSignOut} />
    </div>
  );
}

function DangerZoneCard({ onSignOut }: { onSignOut: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clear = useAuthStore((s) => s.clear);

  const [dialogScope, setDialogScope] = useState<AuthApi.DeleteScope | null>(null);
  const [password, setPassword] = useState("");

  const deleteMutation = useMutation({
    mutationFn: (payload: AuthApi.DeleteAccountRequest) => AuthApi.deleteAccount(payload),
    onSuccess: (resp) => {
      toast.success(
        resp.scope === "all"
          ? "Account and all data deleted"
          : "Profile deleted. You have been signed out.",
      );
      clear();
      queryClient.clear();
      navigate("/login", { replace: true });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    },
  });

  const confirmDelete = () => {
    if (!dialogScope) return;
    deleteMutation.mutate({ password, scope: dialogScope });
  };

  const closeDialog = () => {
    setDialogScope(null);
    setPassword("");
  };

  return (
    <>
      <Card tone="danger">
        <RowHeader
          title="Danger zone"
          description="Sign out, remove your profile, or permanently delete all your data."
        />
        <div className="flex flex-wrap gap-2 mt-4">
          <Button variant="outline" onClick={onSignOut}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
          <Button variant="outline" onClick={() => setDialogScope("profile")}>
            <Trash2 className="h-4 w-4" />
            Delete profile
          </Button>
          <Button variant="destructive" onClick={() => setDialogScope("all")}>
            <AlertTriangle className="h-4 w-4" />
            Delete all data
          </Button>
        </div>
        <p className="text-meta text-muted-foreground mt-3">
          <span className="font-medium">Delete profile</span> clears your email and display name, revokes
          every session, and disables login. <span className="font-medium">Delete all data</span> permanently
          removes your account, sessions, and audit trail.
        </p>
      </Card>

      <AlertDialog open={dialogScope !== null} onOpenChange={(open: boolean) => !open && closeDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialogScope === "all" ? "Delete all data?" : "Delete profile?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialogScope === "all"
                ? "Your account, sessions, and audit logs will be removed. This cannot be undone."
                : "Your profile fields and sessions will be cleared. The username stays reserved."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="delete-password" className="text-meta">
              Confirm with your password
            </Label>
            <Input
              id="delete-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={password.length === 0 || deleteMutation.isPending}
              className={cn(
                dialogScope === "all" && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              )}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {dialogScope === "all" ? "Delete everything" : "Delete profile"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* -------------------- Security -------------------- */

function SecuritySection() {
  const [twoFA, setTwoFA] = useState(false);
  const [emailAlerts, setEmailAlerts] = useState(true);

  return (
    <div className="space-y-6">
      <SectionHeader title="Security" description="Protect your account with strong credentials." />

      <PasswordCard />

      <Card>
        <ToggleRow
          icon={Smartphone}
          title="Two-factor authentication"
          description="Require a one-time code from an authenticator app at sign-in."
          checked={twoFA}
          onChange={(v) => {
            setTwoFA(v);
            toast.message("2FA is not wired up yet");
          }}
        />
        <Separator className="my-4" />
        <ToggleRow
          icon={Mail}
          title="Email login alerts"
          description="Get notified when a new device signs into your account."
          checked={emailAlerts}
          onChange={setEmailAlerts}
        />
      </Card>

      <SessionsCard />
      <ActivityLogCard />
    </div>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const mutation = useMutation({
    mutationFn: (payload: AuthApi.ChangePasswordRequest) => AuthApi.changePassword(payload),
    onSuccess: (resp) => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      toast.success(
        resp.otherSessionsRevoked > 0
          ? `Password updated. ${resp.otherSessionsRevoked} other session(s) signed out.`
          : "Password updated",
      );
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to update password");
    },
  });

  const canSubmit =
    currentPassword.length >= 8 &&
    newPassword.length >= 8 &&
    newPassword === confirm &&
    newPassword !== currentPassword;

  const handleSubmit = () => {
    if (!canSubmit) return;
    mutation.mutate({ currentPassword, newPassword });
  };

  return (
    <Card>
      <RowHeader
        title="Password"
        description="Use at least 8 characters. Changing your password signs out other devices."
      />
      <div className="grid grid-cols-1 gap-4 mt-4">
        <Field label="Current password" id="cur">
          <Input
            id="cur"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="New password" id="new">
            <Input
              id="new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirm new password" id="confirm">
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </div>
        {newPassword.length > 0 && newPassword !== confirm && (
          <p className="text-meta text-destructive">New password and confirmation don't match.</p>
        )}
      </div>
      <div className="flex justify-end mt-5">
        <Button onClick={handleSubmit} disabled={!canSubmit || mutation.isPending}>
          {mutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Key className="h-4 w-4" />
          )}
          Update password
        </Button>
      </div>
    </Card>
  );
}

/* -------------------- Sessions -------------------- */

function SessionsCard() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["settings", "sessions"],
    queryFn: AuthApi.listSessions,
  });

  const revokeOne = useMutation({
    mutationFn: (jti: string) => AuthApi.revokeSession(jti),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "sessions"] });
      toast.success("Session revoked");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to revoke session");
    },
  });

  const revokeOthers = useMutation({
    mutationFn: () => AuthApi.revokeOtherSessions(),
    onSuccess: (resp) => {
      queryClient.invalidateQueries({ queryKey: ["settings", "sessions"] });
      toast.success(
        resp.revoked > 0 ? `${resp.revoked} other session(s) signed out` : "No other sessions were active",
      );
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to sign out other sessions");
    },
  });

  const sessions = query.data?.sessions ?? [];
  const otherCount = sessions.filter((s) => !s.current).length;

  return (
    <Card>
      <RowHeader title="Active sessions" description="Devices currently signed in to your account." />
      <div className="mt-4 space-y-2">
        {query.isLoading ? (
          <div className="py-6 text-center text-meta text-muted-foreground">Loading sessions…</div>
        ) : query.isError ? (
          <div className="py-6 text-center text-meta text-destructive">
            Failed to load sessions.
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-6 text-center text-meta text-muted-foreground">
            No active sessions.
          </div>
        ) : (
          sessions.map((s) => (
            <SessionRow
              key={s.jti}
              session={s}
              onRevoke={() => revokeOne.mutate(s.jti)}
              revoking={revokeOne.isPending && revokeOne.variables === s.jti}
            />
          ))
        )}
      </div>
      <div className="flex justify-end mt-4">
        <Button
          variant="outline"
          onClick={() => revokeOthers.mutate()}
          disabled={otherCount === 0 || revokeOthers.isPending}
        >
          {revokeOthers.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign out other sessions
        </Button>
      </div>
    </Card>
  );
}

function SessionRow({
  session,
  onRevoke,
  revoking,
}: {
  session: AuthApi.SessionItem;
  onRevoke: () => void;
  revoking: boolean;
}) {
  const device = formatDevice(session.userAgent);
  const lastUsed = session.lastUsedAt ? new Date(session.lastUsedAt) : new Date(session.createdAt);
  const location = session.ipAddress ?? "Unknown location";

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-body font-medium truncate">{device}</div>
        <div className="text-meta text-muted-foreground truncate">
          {location} · Last active {lastUsed.toLocaleString()}
        </div>
      </div>
      {session.current ? (
        <span className="text-meta text-accent-foreground bg-accent px-2 py-0.5 rounded-full">
          This device
        </span>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          onClick={onRevoke}
          disabled={revoking}
        >
          {revoking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Revoke"}
        </Button>
      )}
    </div>
  );
}

function formatDevice(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser = parseBrowser(userAgent);
  const os = parseOS(userAgent);
  return `${os} · ${browser}`;
}

/* -------------------- Integrations -------------------- */

function IntegrationsSection() {
  const { connections, connect, disconnect } = useMusicStore();
  const [accounts, setAccounts] = useState<Record<Provider, string>>({
    spotify: "",
    ytmusic: "",
  });

  const handleConnect = (p: Provider) => {
    const account = accounts[p].trim() || (p === "spotify" ? "user@spotify" : "user@ytmusic");
    connect(p, account);
    toast.success(`${p === "spotify" ? "Spotify" : "YouTube Music"} connected`);
  };

  const handleDisconnect = (p: Provider) => {
    disconnect(p);
    toast.success(`${p === "spotify" ? "Spotify" : "YouTube Music"} disconnected`);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Integrations"
        description="Connect Camel to the tools and services you already use."
      />

      <div>
        <h3 className="text-meta font-medium uppercase tracking-wider text-muted-foreground mb-3">
          Music
        </h3>
        <motion.div
          className="space-y-3"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          <ConnectionRow
            provider="spotify"
            name="Spotify"
            hint="username or email"
            color="bg-[hsl(141,73%,42%)]"
            connected={connections.spotify.connected}
            account={connections.spotify.account}
            value={accounts.spotify}
            onChange={(v) => setAccounts((s) => ({ ...s, spotify: v }))}
            onConnect={() => handleConnect("spotify")}
            onDisconnect={() => handleDisconnect("spotify")}
          />
          <ConnectionRow
            provider="ytmusic"
            name="YouTube Music"
            hint="Google account"
            color="bg-[hsl(0,72%,51%)]"
            connected={connections.ytmusic.connected}
            account={connections.ytmusic.account}
            value={accounts.ytmusic}
            onChange={(v) => setAccounts((s) => ({ ...s, ytmusic: v }))}
            onConnect={() => handleConnect("ytmusic")}
            onDisconnect={() => handleDisconnect("ytmusic")}
          />
        </motion.div>
      </div>

      <div>
        <h3 className="text-meta font-medium uppercase tracking-wider text-muted-foreground mb-3">
          Workflow
        </h3>
        <div className="space-y-3">
          <ComingSoonRow icon={Github} name="GitHub" description="Sync notes with issues and PRs." color="bg-[hsl(220,13%,18%)]" />
          <ComingSoonRow icon={Slack} name="Slack" description="Share Camel notes to channels." color="bg-[hsl(327,79%,46%)]" />
        </div>
      </div>

      <p className="text-meta text-muted-foreground">
        Connections are stored locally for now. Wire to real OAuth via Lovable Cloud edge functions.
      </p>
    </div>
  );
}

/* -------------------- Building blocks -------------------- */

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-h2 font-semibold tracking-tight">{title}</h2>
      <p className="text-body text-muted-foreground mt-1">{description}</p>
    </div>
  );
}

function Card({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-5",
        tone === "danger" ? "border-destructive/30" : "border-border",
      )}
    >
      {children}
    </div>
  );
}

function RowHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <div className="text-body font-medium">{title}</div>
      {description && <div className="text-meta text-muted-foreground mt-0.5">{description}</div>}
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-meta">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: typeof Mail;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-body font-medium">{title}</div>
        <div className="text-meta text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ComingSoonRow({
  icon: Icon,
  name,
  description,
  color,
}: {
  icon: typeof Github;
  name: string;
  description: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
      <div className={cn("h-10 w-10 rounded-full flex items-center justify-center text-white shrink-0", color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-body font-medium">{name}</div>
        <div className="text-meta text-muted-foreground truncate">{description}</div>
      </div>
      <span className="text-meta text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
        Soon
      </span>
    </div>
  );
}

/* -------------------- Activity Log -------------------- */

const EVENT_LOGS_PAGE_SIZE = 20;

function ActivityLogCard() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["settings", "event_logs", page, EVENT_LOGS_PAGE_SIZE],
    queryFn: () => AuthApi.eventLogs({ page, pageSize: EVENT_LOGS_PAGE_SIZE }),
  });

  const events = query.data?.events ?? [];
  const retentionDays = query.data?.retentionDays ?? 15;
  const totalEvents = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalEvents / EVENT_LOGS_PAGE_SIZE));
  const pageStart = totalEvents === 0 ? 0 : (page - 1) * EVENT_LOGS_PAGE_SIZE + 1;
  const pageEnd = Math.min(page * EVENT_LOGS_PAGE_SIZE, totalEvents);
  const canGoPrevious = page > 1;
  const canGoNext = page < totalPages;
  const [filter, setFilter] = useState<"all" | string>("all");
  const [queryText, setQueryText] = useState("");

  useEffect(() => {
    setPage(1);
  }, [filter, queryText]);

  useEffect(() => {
    if (query.data && page > totalPages) {
      setPage(totalPages);
    }
  }, [page, query.data, totalPages]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (filter !== "all") {
        const key = `${e.eventType}_${e.success ? "success" : "failed"}`;
        if (key !== filter && e.eventType !== filter) return false;
      }
      if (queryText) {
        const q = queryText.toLowerCase();
        if (
          !(e.ipAddress ?? "").toLowerCase().includes(q) &&
          !(e.userAgent ?? "").toLowerCase().includes(q) &&
          !e.eventType.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [events, filter, queryText]);

  const filters: { id: string; label: string }[] = [
    { id: "all", label: "All" },
    { id: "authenticate_success", label: "Authenticated" },
    { id: "login", label: "Logins" },
    { id: "logout", label: "Logouts" },
    { id: "authenticate_failed", label: "Failures" },
  ];

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <RowHeader
          title="Activity log"
          description="Recent authentication events on your account."
        />
        <div className="flex items-center gap-1.5 text-meta text-muted-foreground">
          <Activity className="h-3.5 w-3.5" />
          {totalEvents} events
          {query.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Search by IP, browser, or event"
            className="pl-9 h-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => {
            const isActive = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "px-2.5 h-9 rounded-md text-meta font-medium transition-colors border",
                  isActive
                    ? "bg-accent text-accent-foreground border-accent"
                    : "bg-background text-muted-foreground border-border hover:text-foreground hover:bg-muted/50",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="mt-4 rounded-lg border border-border overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          {query.isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-4 py-10 text-center text-meta text-muted-foreground"
            >
              Loading events…
            </motion.div>
          ) : filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-4 py-10 text-center text-meta text-muted-foreground"
            >
              No matching events.
            </motion.div>
          ) : (
            <motion.ul
              key="list"
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="divide-y divide-border"
            >
              {filtered.map((e) => {
                const meta = eventMeta(e.eventType, e.success);
                const Icon = meta.icon;
                return (
                  <motion.li
                    key={e.id}
                    variants={staggerItem}
                    className="flex items-start gap-3 px-3 sm:px-4 py-3 hover:bg-muted/40 transition-colors"
                  >
                    <div
                      className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                        meta.tone === "success" && "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]",
                        meta.tone === "danger" && "bg-destructive/15 text-destructive",
                        meta.tone === "muted" && "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-body font-medium">{meta.label}</span>
                        {!e.success && (
                          <span className="text-meta px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                            {e.reason ?? "Review"}
                          </span>
                        )}
                      </div>
                      <div className="text-meta text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                        {e.ipAddress && (
                          <span className="inline-flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            {e.ipAddress}
                          </span>
                        )}
                        {e.userAgent && (
                          <span className="inline-flex items-center gap-1">
                            <Monitor className="h-3 w-3" />
                            {parseBrowser(e.userAgent)} · {parseOS(e.userAgent)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-meta text-muted-foreground whitespace-nowrap shrink-0 pt-0.5">
                      {formatDateTime(new Date(e.createdAt))}
                    </div>
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between mt-3 text-meta text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
          Sign-in events are stored for {retentionDays} days.
        </span>
        <span>
          {pageStart}-{pageEnd} of {totalEvents}
        </span>
      </div>

      <Pagination className="mt-4 justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              aria-disabled={!canGoPrevious}
              className={cn(!canGoPrevious && "pointer-events-none opacity-50")}
              onClick={(event) => {
                event.preventDefault();
                if (canGoPrevious) setPage((current) => current - 1);
              }}
            />
          </PaginationItem>
          {page > 1 && (
            <PaginationItem>
              <PaginationLink
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  setPage(page - 1);
                }}
              >
                {page - 1}
              </PaginationLink>
            </PaginationItem>
          )}
          <PaginationItem>
            <PaginationLink href="#" isActive onClick={(event) => event.preventDefault()}>
              {page}
            </PaginationLink>
          </PaginationItem>
          {page < totalPages && (
            <PaginationItem>
              <PaginationLink
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  setPage(page + 1);
                }}
              >
                {page + 1}
              </PaginationLink>
            </PaginationItem>
          )}
          <PaginationItem>
            <PaginationNext
              href="#"
              aria-disabled={!canGoNext}
              className={cn(!canGoNext && "pointer-events-none opacity-50")}
              onClick={(event) => {
                event.preventDefault();
                if (canGoNext) setPage((current) => current + 1);
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </Card>
  );
}

function eventMeta(type: string, success: boolean) {
  if (type === "authenticate") {
    return success
      ? { label: "Authenticate success", icon: ShieldCheck, tone: "success" as const }
      : { label: "Authenticate failed", icon: XCircle, tone: "danger" as const };
  }
  if (type === "login") {
    return success
      ? { label: "Login success", icon: LogIn, tone: "success" as const }
      : { label: "Login failed", icon: XCircle, tone: "danger" as const };
  }
  if (type === "logout") {
    return { label: "Logout", icon: LogOut, tone: "muted" as const };
  }
  if (type === "refresh") {
    return success
      ? { label: "Session refreshed", icon: ShieldCheck, tone: "success" as const }
      : { label: "Refresh failed", icon: XCircle, tone: "danger" as const };
  }
  if (type === "password_change") {
    return success
      ? { label: "Password changed", icon: Key, tone: "success" as const }
      : { label: "Password change failed", icon: XCircle, tone: "danger" as const };
  }
  if (type === "session_revoke" || type === "session_revoke_others") {
    return { label: "Session revoked", icon: LogOut, tone: "muted" as const };
  }
  if (type === "account_delete") {
    return { label: "Account deletion", icon: Trash2, tone: "danger" as const };
  }
  return { label: type, icon: Activity, tone: "muted" as const };
}

function parseBrowser(ua: string) {
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return "Browser";
}

function parseOS(ua: string) {
  if (/Windows NT 10/.test(ua)) return "Windows 10";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad/.test(ua)) return "iOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown OS";
}

function formatDateTime(d: Date) {
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function ConnectionRow({
  provider,
  name,
  hint,
  color,
  connected,
  account,
  value,
  onChange,
  onConnect,
  onDisconnect,
}: {
  provider: Provider;
  name: string;
  hint: string;
  color: string;
  connected: boolean;
  account?: string;
  value: string;
  onChange: (v: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <motion.div
      variants={staggerItem}
      className="rounded-xl border border-border bg-card p-4 space-y-3"
    >
      <div className="flex items-center gap-3">
        <div className={cn("h-10 w-10 rounded-full flex items-center justify-center text-white shrink-0", color)}>
          <Music2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-body font-medium">{name}</div>
          <div className="text-meta text-muted-foreground truncate flex items-center gap-1.5">
            {connected ? (
              <>
                <Check className="h-3 w-3 text-primary" />
                Connected as {account}
              </>
            ) : (
              <>
                <Plug className="h-3 w-3" />
                Not connected
              </>
            )}
          </div>
        </div>
        {connected && (
          <Button size="sm" variant="outline" onClick={onDisconnect}>
            Disconnect
          </Button>
        )}
      </div>
      {!connected && (
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor={`${provider}-account`} className="text-meta">
              {hint}
            </Label>
            <Input
              id={`${provider}-account`}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={hint}
              className="h-9"
            />
          </div>
          <Button size="sm" onClick={onConnect}>
            Connect
          </Button>
        </div>
      )}
    </motion.div>
  );
}
