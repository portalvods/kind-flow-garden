import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Film, LogOut, LayoutDashboard, ShoppingBag, MessageCircle, MessagesSquare, Palette, ListVideo, Users, Bot, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getPublicSettings } from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      return !!data;
    },
  });

  const settingsFn = useServerFn(getPublicSettings);
  const { data: settings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: () => settingsFn(),
  });

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/40 backdrop-blur-md sticky top-0 z-40 bg-background/70">
        <div className="mx-auto max-w-7xl px-4 h-16 flex items-center justify-between">
          <Link to="/pedidos" className="flex items-center gap-2">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="" className="h-8 w-auto" />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center glow-primary">
                <Film className="h-4 w-4 text-primary-foreground" />
              </div>
            )}
            <span className="font-display font-bold text-lg hidden sm:inline">
              {settings?.site_name ?? "Portal VOD"}
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            <NavLink to="/pedidos" active={pathname === "/pedidos"} icon={<ShoppingBag className="h-4 w-4" />}>
              Meus pedidos
            </NavLink>
            {isAdmin && (
              <>
                <NavLink to="/admin" active={pathname === "/admin"} icon={<LayoutDashboard className="h-4 w-4" />}>
                  Admin
                </NavLink>
                <NavLink to="/admin/usuarios" active={pathname.startsWith("/admin/usuarios")} icon={<Users className="h-4 w-4" />}>
                  Usuários
                </NavLink>
                <NavLink to="/admin/whatsapp" active={pathname.startsWith("/admin/whatsapp")} icon={<MessageCircle className="h-4 w-4" />}>
                  WhatsApp
                </NavLink>
                <NavLink to="/admin/mensagens" active={pathname.startsWith("/admin/mensagens")} icon={<MessagesSquare className="h-4 w-4" />}>
                  Mensagens
                </NavLink>
                <NavLink to="/admin/catalogo" active={pathname.startsWith("/admin/catalogo")} icon={<ListVideo className="h-4 w-4" />}>
                  Catálogo
                </NavLink>
                <NavLink to="/admin/automacao" active={pathname.startsWith("/admin/automacao")} icon={<Bot className="h-4 w-4" />}>
                  IA
                </NavLink>
                <NavLink to="/admin/aparencia" active={pathname.startsWith("/admin/aparencia")} icon={<Palette className="h-4 w-4" />}>
                  Aparência
                </NavLink>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={signOut} className="ml-2">
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({
  to,
  active,
  icon,
  children,
}: {
  to: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent/10"
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </Link>
  );
}
