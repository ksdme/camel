import { useEffect, useState, type FormEvent } from "react";
import { Capacitor } from "@capacitor/core";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, LogIn, Smartphone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ApiError } from "@/lib/api";
import * as AuthApi from "@/lib/auth-api";
import { useAuthStore } from "@/stores/authStore";
import { ease } from "@/lib/motion";
import { useToast } from "@/hooks/use-toast";

const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

function validate(username: string, password: string): string | null {
  if (username.length < 3 || username.length > 32 || !USERNAME_RE.test(username)) {
    return "Username must be 3-32 characters, letters/numbers/underscore only.";
  }
  if (password.length < 8 || password.length > 128) {
    return "Password must be 8-128 characters.";
  }
  return null;
}

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (user && status === "authenticated") {
      navigate("/", { replace: true });
    }
  }, [navigate, status, user]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNativeMobile = Capacitor.isNativePlatform();
  const [mobileLoginMode, setMobileLoginMode] = useState<"qr" | "password">(
    isNativeMobile ? "qr" : "password",
  );
  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const validationError = validate(username, password);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const data = await AuthApi.login({ username, password });
      setUser(data.user);
      toast({
        title: data.created ? "Welcome to Camel" : "Welcome back",
        description: data.created
          ? `Account created for @${data.user.username}.`
          : `Signed in as @${data.user.username}.`,
      });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to sign in. Please try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-accent/40 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-[26rem] w-[26rem] rounded-full bg-primary/15 blur-3xl" />
      </div>

      <header className="relative flex items-center justify-between px-6 py-5 sm:px-10">
        <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          <span>Camel</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="relative flex items-center justify-center px-4 pb-16 pt-6 sm:pt-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease }}
          className="w-full max-w-md"
        >
          <Card className="border-border/70 bg-card/80 shadow-xl backdrop-blur-sm">
            <CardHeader className="space-y-2 pb-4">
              <CardTitle className="text-2xl">Welcome to Camel</CardTitle>
              <CardDescription>
                Sign in with your username, or pick a new one to create an account.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={onSubmit} className="space-y-5" noValidate>
                {isNativeMobile ? (
                  <div className="space-y-2">
                    <Button type="button" className="w-full" asChild>
                      <Link to="/mobile/pair">
                        <Smartphone className="h-4 w-4" />
                        QR Scan Login (Recommended)
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      className="w-full"
                      variant="outline"
                      onClick={() => setMobileLoginMode("password")}
                    >
                      <LogIn className="h-4 w-4" />
                      Username and Password
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Use QR Scan Login to pair and sign in faster.
                    </p>
                  </div>
                ) : null}

                {(!isNativeMobile || mobileLoginMode === "password") && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        name="username"
                        type="text"
                        autoComplete="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder="your_handle"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        disabled={submitting}
                        minLength={3}
                        maxLength={32}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        3-32 characters. Letters, numbers, underscore.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        placeholder="........"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={submitting}
                        minLength={8}
                        maxLength={128}
                        required
                      />
                      <p className="text-xs text-muted-foreground">At least 8 characters.</p>
                    </div>

                    {error ? (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, ease }}
                        role="alert"
                        className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                      >
                        {error}
                      </motion.div>
                    ) : null}

                    <Button type="submit" className="w-full" disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        <>
                          <LogIn className="h-4 w-4" />
                          Continue
                        </>
                      )}
                    </Button>
                  </>
                )}

                <p className="text-center text-xs text-muted-foreground">
                  By continuing you agree to the Camel terms and privacy notice.
                </p>
              </form>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            New here? Enter a fresh username and your account is created automatically.
          </p>
        </motion.div>
      </main>
    </div>
  );
};

export default Login;
