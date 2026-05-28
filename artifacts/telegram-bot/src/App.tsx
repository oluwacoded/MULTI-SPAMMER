import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setBaseUrl } from "@workspace/api-client-react";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import TgCampaign from "@/pages/TgCampaign";
import SmsCampaign from "@/pages/SmsCampaign";
import SmsFlash from "@/pages/SmsFlash";
import Settings from "@/pages/Settings";
import ContactLists from "@/pages/ContactLists";
import CampaignHistory from "@/pages/CampaignHistory";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } }
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/login" component={Login} />
      <Route path="/tg-campaign" component={TgCampaign} />
      <Route path="/sms-campaign" component={SmsCampaign} />
      <Route path="/sms-flash" component={SmsFlash} />
      <Route path="/settings" component={Settings} />
      <Route path="/contact-lists" component={ContactLists} />
      <Route path="/campaign-history" component={CampaignHistory} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  useEffect(() => {
    const saved = localStorage.getItem("mfg_api_base");
    if (saved) setBaseUrl(saved);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
