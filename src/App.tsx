import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StoreProvider } from "@/components/StoreProvider";
import { supabase } from "@/integrations/supabase/client";
import Dashboard from "./pages/Dashboard";
import Study from "./pages/Study";
import WordBank from "./pages/WordBank";
import AddWords from "./pages/AddWords";
import Menu from "./pages/Menu";
import FsrsParams from "./pages/FsrsParams";
import Stats from "./pages/Stats";
import Profile from "./pages/Profile";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <span className="text-[15px] text-ink-weak">laden</span>
      </div>
    );
  }

  if (!session) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Auth />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <StoreProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            {/* Eén product, één oppervlak: geen tabs, geen bottom bar — de hamburger is de navigatie. */}
            <Routes>
              <Route path="/"              element={<Dashboard />} />
              <Route path="/studeren"      element={<Study />} />
              <Route path="/woordenbank"   element={<WordBank />} />
              <Route path="/toevoegen"     element={<AddWords />} />
              <Route path="/menu"          element={<Menu />} />
              <Route path="/fsrs"          element={<FsrsParams />} />
              <Route path="/statistieken"  element={<Stats />} />
              <Route path="/profiel"       element={<Profile />} />
              <Route path="*"              element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </StoreProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
