import { useState, useEffect } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Film, ShoppingBag, Users2, Bell, CheckCircle2, ChevronRight, ChevronLeft } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { updateProfilePreferences } from "@/lib/profile.functions";

const STEPS = [
  {
    title: "Bem-vindo ao seu Portal!",
    description: "Vamos te mostrar rapidinho como aproveitar tudo por aqui.",
    icon: <Film className="h-12 w-12 text-primary" />,
    color: "bg-primary/10"
  },
  {
    title: "Faça seus Pedidos",
    description: "Na aba 'Meus pedidos', você pode buscar qualquer filme ou série e solicitar a adição.",
    icon: <ShoppingBag className="h-12 w-12 text-blue-400" />,
    color: "bg-blue-500/10"
  },
  {
    title: "Novidades e Em alta",
    description: "Veja na aba 'Novidades' o que foi adicionado recentemente e em 'Em alta' os títulos do momento.",
    icon: <Users2 className="h-12 w-12 text-emerald-400" />,
    color: "bg-emerald-500/10"
  },
  {
    title: "Acompanhe pelo WhatsApp",
    description: "Você receberá uma notificação automática assim que seu conteúdo estiver disponível.",
    icon: <Bell className="h-12 w-12 text-amber-400" />,
    color: "bg-amber-500/10"
  }
];

export function TutorialDialog({ isOpen, onComplete }: { isOpen: boolean; onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const qc = useQueryClient();
  const updatePrefsFn = useServerFn(updateProfilePreferences);

  const completeMutation = useMutation({
    mutationFn: () => updatePrefsFn({ data: { tutorial_completed: true } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile-preferences"] });
      onComplete();
    }
  });

  const next = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else completeMutation.mutate();
  };

  const prev = () => {
    if (step > 0) setStep(s => s - 1);
  };

  if (!isOpen) return null;

  const current = STEPS[step];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && completeMutation.mutate()}>
      <DialogContent className="sm:max-w-md border-none glass-card">
        <DialogHeader className="items-center text-center">
          <div className={`h-20 w-20 rounded-3xl ${current.color} flex items-center justify-center mb-4 transition-colors duration-500`}>
            {current.icon}
          </div>
          <DialogTitle className="font-display text-2xl">{current.title}</DialogTitle>
          <DialogDescription className="text-base pt-2">
            {current.description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center gap-1.5 py-4">
          {STEPS.map((_, i) => (
            <div 
              key={i} 
              className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? "w-8 bg-primary" : "w-2 bg-muted-foreground/30"}`} 
            />
          ))}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button variant="ghost" onClick={prev} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
          </Button>
          <Button onClick={next} className="glow-primary">
            {step === STEPS.length - 1 ? (
              <><CheckCircle2 className="h-4 w-4 mr-2" /> Começar Agora</>
            ) : (
              <>Próximo <ChevronRight className="h-4 w-4 ml-1" /></>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
