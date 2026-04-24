import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/stores/authStore";
import { Sparkles, ShieldCheck, CalendarDays, User } from "lucide-react";

export default function Profile() {
  const user = useAuthStore((s) => s.user);

  const profileItems = useMemo(
    () => [
      {
        label: "Username",
        value: user?.username ?? "—",
        icon: User,
      },
      {
        label: "Display name",
        value: user?.displayName ?? "Not set",
        icon: User,
      },
      {
        label: "Email",
        value: user?.email ?? "Not set",
        icon: ShieldCheck,
      },
      {
        label: "Account ID",
        value: user?.id ?? "—",
        icon: ShieldCheck,
      },
      {
        label: "Member since",
        value: user ? new Date(user.createdAt).toLocaleDateString() : "—",
        icon: CalendarDays,
      },
    ],
    [user],
  );

  return (
    <div className="h-full overflow-y-auto px-6 py-8 sm:px-10 sm:py-10">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-foreground">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-h1 font-semibold">Profile</h1>
              <p className="text-body text-muted-foreground">
                See and manage your Camel account details.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-3xl border border-border bg-card p-6">
            <CardHeader className="space-y-3 p-0">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sand-200 text-foreground">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">Account</CardTitle>
                  <CardDescription className="text-sm text-muted-foreground">
                    Your safe login profile and account metadata.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="grid gap-4 pt-4">
              {profileItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-3xl border border-border bg-background/80 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-100 text-slate-900">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        <p className="text-sm text-muted-foreground">{item.value}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-border bg-card p-6">
            <CardHeader className="space-y-3 p-0">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">Security</CardTitle>
                  <CardDescription className="text-sm text-muted-foreground">
                    Authentication and session information for your account.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-4">
              <div className="rounded-3xl border border-border bg-background/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Session status</p>
                    <p className="text-sm text-muted-foreground">Your session is active for this browser.</p>
                  </div>
                  <Badge>Active</Badge>
                </div>
              </div>
              <div className="rounded-3xl border border-border bg-background/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Account protection</p>
                    <p className="text-sm text-muted-foreground">
                      Camel uses secure cookies and refresh tokens for long-lived sessions.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
