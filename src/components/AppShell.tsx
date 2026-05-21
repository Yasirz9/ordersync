// src/components/AppShell.tsx  — REPLACE existing file with this
// Changes: Added "SMS" nav item pointing to /sms

import { Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Package, LogOut, Search, Shield, Download, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, role, signOut } = useAuth();
  const location = useLocation();
  const isAdmin = role === "admin";

  const nav = [
    { to: "/", label: "Search", icon: Search, show: true },
    { to: "/sms", label: "SMS", icon: MessageSquare, show: true },   // ← new
    { to: "/admin", label: "Admin", icon: Shield, show: isAdmin },
    { to: "/setup", label: "Setup", icon: Download, show: isAdmin },
  ].filter((n) => n.show);

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 font-semibold">
              <Package className="h-5 w-5 text-primary" />
              <span>Order Lookup</span>
            </Link>
            <nav className="flex items-center gap-1">
              {nav.map((n) => {
                const active = location.pathname === n.to;
                const Icon = n.icon;
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {user?.email}{" "}
              {isAdmin && <span className="text-primary">(admin)</span>}
            </span>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="h-4 w-4" />
              <span className="ml-1.5">Logout</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
