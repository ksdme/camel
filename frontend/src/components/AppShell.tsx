import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/authStore";
import { Loader2, LogOut } from "lucide-react";
import { MusicPlayerHost } from "@/components/MusicPlayerHost";
import { MiniPlayer } from "@/components/MiniPlayer";

interface AppShellProps {
  title?: string;
  children: ReactNode;
}

export function AppShell({ title, children }: AppShellProps) {
  const navigate = useNavigate();
  const { user, hydrated, status, signOut } = useAuthStore();

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <SidebarProvider>
      <MusicPlayerHost />
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4 border-b border-border px-2 sm:px-6">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <SidebarTrigger className="md:hidden shrink-0" />
              {title ? (
                <h1 className="text-sm sm:text-base font-semibold text-foreground truncate">
                  {title}
                </h1>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-3">
              {status === "loading" || !hydrated ? (
                <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading auth
                </span>
              ) : null}
              {user ? (
                <span className="hidden md:inline-flex text-sm text-muted-foreground truncate max-w-[14rem]">
                  Signed in as @{user.username}
                </span>
              ) : null}
              <ThemeToggle />
              <Button
                size="sm"
                variant="outline"
                onClick={handleLogout}
                aria-label="Logout"
                className="px-2 sm:px-3"
              >
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </header>

          <main className="flex-1 overflow-hidden bg-background text-foreground">{children}</main>
        </div>
      </div>
      <MiniPlayer />
    </SidebarProvider>
  );
}
