import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getToken } from "@/lib/auth";
import { AuthGuard, PublicOnly } from "@/components/AuthGuard";
import { Layout } from "@/components/Layout";
import Home from "@/pages/Home";
import Order from "@/pages/Order";
import Status from "@/pages/Status";
import Orders from "@/pages/Orders";
import Wallet from "@/pages/Wallet";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function App() {
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Switch>
            <Route path="/login">
              <PublicOnly>
                <Login />
              </PublicOnly>
            </Route>
            <Route path="/register">
              <PublicOnly>
                <Register />
              </PublicOnly>
            </Route>
            <Route>
              <AuthGuard>
                <Layout>
                  <Switch>
                    <Route path="/" component={Home} />
                    <Route path="/order" component={Order} />
                    <Route path="/status" component={Status} />
                    <Route path="/orders" component={Orders} />
                    <Route path="/wallet" component={Wallet} />
                    <Route component={NotFound} />
                  </Switch>
                </Layout>
              </AuthGuard>
            </Route>
          </Switch>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
