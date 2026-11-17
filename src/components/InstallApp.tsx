import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const update = () => setInstalled(media.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    update();
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    const beforeInstall = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const didInstall = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", didInstall);
    media.addEventListener("change", update);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", didInstall);
      media.removeEventListener("change", update);
    };
  }, []);

  if (installed) return null;
  const install = async () => {
    if (!prompt) { setHelpOpen(true); return; }
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  };
  return <>
    <Button variant="ghost" size="sm" onClick={() => void install()} title="Instalar aplicativo" aria-label="Instalar aplicativo">
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">Instalar</span>
    </Button>
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-primary" /> Instalar aplicativo</DialogTitle>
          <DialogDescription>
            {ios ? 'No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.' : 'Abra o site no navegador do celular e escolha “Adicionar à tela inicial” ou “Instalar aplicativo” no menu do navegador.'}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">O aplicativo precisa de internet. Se estiver na pré-visualização, abra o endereço publicado do site.</p>
        <Button onClick={() => setHelpOpen(false)}>Entendi</Button>
      </DialogContent>
    </Dialog>
  </>;
}