import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/AppShell";
import { MobileDeepLinkBridge } from "@/components/MobileDeepLinkBridge";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./hooks/pages/Index.tsx";
import Login from "./pages/Login.tsx";
import MobileConsumeLoginPage from "./pages/MobileConsumeLoginPage.tsx";
import MobilePairPage from "./pages/MobilePairPage.tsx";
import Profile from "./pages/Profile.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import ShareLandingPage from "./pages/ShareLandingPage.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <MobileDeepLinkBridge />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/mobile/pair" element={<MobilePairPage />} />
          <Route path="/mobile/consume-login" element={<MobileConsumeLoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppShell>
                  <Index />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <AppShell title="Profile">
                  <Profile />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <AppShell title="Settings">
                  <SettingsPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route path="/s/:token" element={<ShareLandingPage />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
