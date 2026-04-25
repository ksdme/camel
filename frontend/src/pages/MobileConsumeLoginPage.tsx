import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Smartphone } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import * as AuthApi from "@/lib/auth-api";
import { ApiError } from "@/lib/api";
import { getPairedApiUrl, normalizeDevServerUrl, setPairedAppConfig } from "@/lib/dev-pairing";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";

export default function MobileConsumeLoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const token = searchParams.get("t")?.trim() || "";
      if (!token) {
        setError("This QR login link is missing its sign-in token.");
        return;
      }

      const serverUrl = normalizeDevServerUrl(window.location.origin);
      if (!serverUrl) {
        setError("This server URL is not valid for mobile sign-in.");
        return;
      }

      try {
        const pairedApiUrl = await getPairedApiUrl();
        await setPairedAppConfig(serverUrl, pairedApiUrl);
        const data = await AuthApi.consumeMobileLoginToken(token);
        if (cancelled) return;

        setUser(data.user);
        toast.success(`Signed in as @${data.user.username}.`);
        navigate("/", { replace: true });
      } catch (err) {
        if (cancelled) return;

        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unable to complete mobile sign-in.";
        setError(message);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams, setUser]);

  return (
    <div className="min-h-screen w-full bg-background px-4 py-8 text-foreground sm:px-6">
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              QR Scan Login
            </CardTitle>
            <CardDescription>
              Camel is finishing sign-in on this mobile device.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <>
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                  <div className="inline-flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link to="/mobile/pair">Scan Again</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/login">Use Username and Password</Link>
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-4 text-sm text-muted-foreground inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing you in...
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
