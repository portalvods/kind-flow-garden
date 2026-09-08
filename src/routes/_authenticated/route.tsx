import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Film, LogOut, LayoutDashboard, ShoppingBag, MessageCircle, MessagesSquare, Palette, ListVideo, Users, Bot, Wrench, Trophy, MessageSquareCode, Sparkles, ThumbsUp, Menu, Flame, Activity, MessageSquare, BarChart3, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { toast } from "sonner";
import { getPublicSettings } from "@/lib/settings.functions";
import { TutorialDialog } from "@/components/TutorialDialog";
import { useState, useEffect } from "react";


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
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Track activity (client-side so auth.uid() is available in the RPC)
  useQuery({
    queryKey: ["track-activity", user.id],
    queryFn: async () => {
      await supabase.rpc("track_session");
      return true;
    },
    refetchInterval: 60000, // Refresh every minute
  });

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

  const { data: prefs } = useQuery({
    queryKey: ["profile-preferences", user.id],
    queryFn: async () => {
      const { data } = await supabase.from("profile_preferences").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (prefs && prefs.tutorial_completed === false) {
      setTutorialOpen(true);
    }
  }, [prefs]);

  // Aplica as cores escolhidas pelo cliente
  useEffect(() => {
    const root = document.documentElement;
    if (prefs?.theme_color) {
      root.style.setProperty("--primary", prefs.theme_color);
      root.style.setProperty("--ring", prefs.theme_color);
    }
    if (prefs?.accent_color) {
      root.style.setProperty("--accent", prefs.accent_color);
    }
  }, [prefs?.theme_color, prefs?.accent_color]);

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
        <div className="mx-auto max-w-7xl px-3 sm:px-4 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
          {/* Menu do cliente (hambúrguer no mobile) */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0 overflow-y-auto">
              <SheetHeader className="px-4 py-4 border-b border-border/40">
                <SheetTitle className="font-display text-lg text-left">Navegação</SheetTitle>
              </SheetHeader>
              <div className="py-4">
                <SidebarGroup title="Cliente" pathname={pathname}>
                  <SidebarLink to="/pedidos" icon={<ShoppingBag className="h-4 w-4" />}>Meus pedidos</SidebarLink>
                  <SidebarLink to="/novidades" icon={<Sparkles className="h-4 w-4" />}>Novidades</SidebarLink>
                  <SidebarLink to="/em-alta" icon={<Flame className="h-4 w-4" />}>Em alta</SidebarLink>
                  <SidebarLink to="/perfil" icon={<UserIcon className="h-4 w-4" />}>Meu perfil</SidebarLink>
                </SidebarGroup>

                {isAdmin && (
                  <>
                    <SidebarGroup title="Admin · Principal" pathname={pathname}>
                      <SidebarLink to="/admin" icon={<LayoutDashboard className="h-4 w-4" />}>Dashboard</SidebarLink>
                      <SidebarLink to="/admin/dashboard-stats" icon={<BarChart3 className="h-4 w-4" />}>Estatísticas</SidebarLink>
                      <SidebarLink to="/admin/monitoramento" icon={<Activity className="h-4 w-4" />}>Monitoramento</SidebarLink>
                      <SidebarLink to="/admin/curtidos" icon={<ThumbsUp className="h-4 w-4" />}>Mais curtidos</SidebarLink>
                      <SidebarLink to="/admin/ranking" icon={<Trophy className="h-4 w-4" />}>Ranking</SidebarLink>
                    </SidebarGroup>
                    <SidebarGroup title="Admin · Gestão" pathname={pathname}>
                      <SidebarLink to="/admin/usuarios" icon={<Users className="h-4 w-4" />}>Usuários</SidebarLink>
                      <SidebarLink to="/admin/catalogo" icon={<ListVideo className="h-4 w-4" />}>Catálogo</SidebarLink>
                      <SidebarLink to="/admin/ferramentas" icon={<Wrench className="h-4 w-4" />}>Ferramentas</SidebarLink>
                    </SidebarGroup>
                    <SidebarGroup title="Admin · Comunicação" pathname={pathname}>
                      <SidebarLink to="/admin/whatsapp" icon={<MessageCircle className="h-4 w-4" />}>WhatsApp</SidebarLink>
                      <SidebarLink to="/admin/conversas" icon={<MessageSquare className="h-4 w-4" />}>Conversas</SidebarLink>
                      <SidebarLink to="/admin/mensagens" icon={<MessagesSquare className="h-4 w-4" />}>Mensagens</SidebarLink>
                      <SidebarLink to="/admin/bot" icon={<MessageSquareCode className="h-4 w-4" />}>Bot</SidebarLink>
                    </SidebarGroup>
                    <SidebarGroup title="Admin · Configurações" pathname={pathname}>
                      <SidebarLink to="/admin/automacao" icon={<Bot className="h-4 w-4" />}>Automação IA</SidebarLink>
                      <SidebarLink to="/admin/aparencia" icon={<Palette className="h-4 w-4" />}>Aparência</SidebarLink>
                    </SidebarGroup>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
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
          </div>

          <nav className="flex items-center gap-1">

            <div className="hidden lg:flex items-center gap-1">
              <NavLink to="/pedidos" active={pathname === "/pedidos"} icon={<ShoppingBag className="h-4 w-4" />}>
                Meus pedidos
              </NavLink>
              <NavLink to="/novidades" active={pathname.startsWith("/novidades")} icon={<Sparkles className="h-4 w-4" />}>
                Novidades
              </NavLink>
              <NavLink to="/em-alta" active={pathname.startsWith("/em-alta")} icon={<Flame className="h-4 w-4" />}>
                Em alta
              </NavLink>
              <NavLink to="/perfil" active={pathname.startsWith("/perfil")} icon={<UserIcon className="h-4 w-4" />}>
                Meu perfil
              </NavLink>
            </div>





            {isAdmin && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`hidden lg:inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      pathname.startsWith("/admin")
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/10"
                    }`}
                  >
                    <Menu className="h-4 w-4" />
                    <span className="hidden sm:inline">Admin</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[280px] p-0">
                  <SheetHeader className="px-4 py-4 border-b border-border/40">
                    <SheetTitle className="font-display text-lg text-left">Painel administrativo</SheetTitle>
                  </SheetHeader>

                  <div className="py-4 overflow-y-auto">
                    <SidebarGroup title="Principal" pathname={pathname}>
                      <SidebarLink to="/admin" icon={<LayoutDashboard className="h-4 w-4" />}>Dashboard</SidebarLink>
                      <SidebarLink to="/admin/dashboard-stats" icon={<BarChart3 className="h-4 w-4" />}>Estatísticas</SidebarLink>
                      <SidebarLink to="/admin/monitoramento" icon={<Activity className="h-4 w-4" />}>Monitoramento</SidebarLink>
                      <SidebarLink to="/admin/curtidos" icon={<ThumbsUp className="h-4 w-4" />}>Mais curtidos</SidebarLink>
                      <SidebarLink to="/admin/ranking" icon={<Trophy className="h-4 w-4" />}>Ranking</SidebarLink>
                    </SidebarGroup>

                    <SidebarGroup title="Gestão" pathname={pathname}>
                      <SidebarLink to="/admin/usuarios" icon={<Users className="h-4 w-4" />}>Usuários</SidebarLink>
                      
                      <SidebarLink to="/admin/catalogo" icon={<ListVideo className="h-4 w-4" />}>Catálogo</SidebarLink>
                      <SidebarLink to="/admin/ferramentas" icon={<Wrench className="h-4 w-4" />}>Ferramentas</SidebarLink>
                    </SidebarGroup>

                    <SidebarGroup title="Comunicação" pathname={pathname}>
                      <SidebarLink to="/admin/whatsapp" icon={<MessageCircle className="h-4 w-4" />}>WhatsApp</SidebarLink>
                      <SidebarLink to="/admin/conversas" icon={<MessageSquare className="h-4 w-4" />}>Conversas</SidebarLink>
                      <SidebarLink to="/admin/mensagens" icon={<MessagesSquare className="h-4 w-4" />}>Mensagens</SidebarLink>
                      <SidebarLink to="/admin/bot" icon={<MessageSquareCode className="h-4 w-4" />}>Bot</SidebarLink>
                    </SidebarGroup>

                    <SidebarGroup title="Configurações" pathname={pathname}>
                      <SidebarLink to="/admin/automacao" icon={<Bot className="h-4 w-4" />}>Automação IA</SidebarLink>
                      <SidebarLink to="/admin/aparencia" icon={<Palette className="h-4 w-4" />}>Aparência</SidebarLink>
                    </SidebarGroup>
                  </div>
                </SheetContent>
              </Sheet>
            )}
            <Button variant="ghost" size="sm" onClick={signOut} className="ml-2">
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </nav>

        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl overflow-x-hidden px-3 py-6 sm:px-4 sm:py-8">
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

function SidebarGroup({
  title,
  pathname,
  children,
}: {
  title: string;
  pathname: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <h3 className="px-4 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <ul className="space-y-1">
        {children}
      </ul>
    </div>
  );
}

function SidebarLink({
  to,
  icon,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = pathname === to || pathname.startsWith(`${to}/`);
  return (
    <li>
      <SheetClose asChild>
        <Link
          to={to}
          className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
            active ? "bg-primary/15 text-primary border-r-2 border-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent/10"
          }`}
        >
          {icon}
          {children}
        </Link>
      </SheetClose>
    </li>
  );
}

