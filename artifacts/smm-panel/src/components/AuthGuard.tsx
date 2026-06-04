import React from "react";
import { useLocation } from "wouter";
import { isLoggedIn } from "@/lib/auth";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const loggedIn = isLoggedIn();

  React.useEffect(() => {
    if (!loggedIn && !location.startsWith("/login") && !location.startsWith("/register")) {
      setLocation("/login");
    }
  }, [loggedIn, location, setLocation]);

  if (!loggedIn && !location.startsWith("/login") && !location.startsWith("/register")) {
    return null;
  }

  return <>{children}</>;
}

export function PublicOnly({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const loggedIn = isLoggedIn();

  React.useEffect(() => {
    if (loggedIn) {
      setLocation("/");
    }
  }, [loggedIn, setLocation]);

  if (loggedIn) return null;
  return <>{children}</>;
}
