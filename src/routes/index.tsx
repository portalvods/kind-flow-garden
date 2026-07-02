import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Film, Zap, Bell, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPublicSettings } from "@/lib/settings.functions";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const settingsFn = useServerFn(getPublicSettings);
  const { data: settings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: () => settingsFn(),
  });
  const siteName = settings?.site_name ?? "Portal VOD";
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="border-b border-border/40 backdrop-blur-md sticky top-0 z-40 bg-background/60">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="" className="h-8 w-auto" />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center glow-primary">
                <Film className="h-4 w-4 text-primary-foreground" />
              </div>
            )}
            <span className="font-display font-bold text-lg">{siteName}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth" search={{ mode: "signup" }}>
                Criar conta
              </Link>
            </Button>
          </div>
        </div>
      </header>


      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1 text-xs text-muted-foreground mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          Sistema premium de pedidos VOD
        </div>
        <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]">
          Peça qualquer filme ou série
          <br />
          <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
            direto no site.
          </span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Busca inteligente conectada ao TMDB, painel administrativo completo e
          notificações automáticas via WhatsApp quando seu conteúdo estiver disponível.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="text-base h-12 px-6 glow-primary">
            <Link to="/auth" search={{ mode: "signup" }}>
              Fazer meu pedido <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="text-base h-12 px-6">
            <Link to="/auth">Já tenho conta</Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 pb-24">
        <div className="grid gap-4 md:grid-cols-3">
          <Feature
            icon={<Zap className="h-5 w-5" />}
            title="Busca inteligente TMDB"
            desc="Digite o nome e o pôster, ano e sinopse aparecem automaticamente."
          />
          <Feature
            icon={<Bell className="h-5 w-5" />}
            title="Notificações WhatsApp"
            desc="Você recebe alertas em tempo real via WhatsApp."
          />
          <Feature
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Acompanhe seus pedidos"
            desc="Veja o status de cada solicitação e o histórico completo em um só lugar."
          />
        </div>
      </section>

      <footer className="border-t border-border/40 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} {siteName}
      </footer>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="font-display font-semibold text-lg mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
