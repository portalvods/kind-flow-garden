import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { listTemplates, saveTemplate } from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/admin/mensagens")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!data) throw redirect({ to: "/pedidos" });
  },
  component: MessagesPage,
});

const VARIABLES_HELP: Record<string, string> = {
  received: "{cliente}, {titulo}, {tipo}, {formato}, {obs}",
  analyzing: "{cliente}, {titulo}",
  approved: "{cliente}, {titulo}",
  completed: "{cliente}, {titulo}",
  fixed: "{cliente}, {titulo}",
  rejected: "{cliente}, {titulo}, {motivo}",
  admin_new_request: "{cliente}, {whatsapp}, {titulo}, {tipo}, {formato}, {obs}",
};

function MessagesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTemplates);
  const saveFn = useServerFn(saveTemplate);

  const { data, isLoading } = useQuery({
    queryKey: ["message-templates"],
    queryFn: () => listFn(),
  });

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data?.templates) return;
    const initial: Record<string, string> = {};
    for (const t of data.templates) initial[t.key as string] = (t.content as string) ?? "";
    setDrafts(initial);
  }, [data]);

  const save = useMutation({
    mutationFn: async (input: { key: string; content: string }) => saveFn({ data: input }),
    onSuccess: () => {
      toast.success("Mensagem salva!");
      qc.invalidateQueries({ queryKey: ["message-templates"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao salvar"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Mensagens do WhatsApp</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Edite os textos enviados automaticamente aos clientes em cada etapa do pedido.
          Use variáveis entre chaves como <code className="text-primary">{"{cliente}"}</code> ou{" "}
          <code className="text-primary">{"{titulo}"}</code>.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {(data?.templates ?? []).map((t) => {
            const key = t.key as string;
            const label = (t.label as string) ?? key;
            const value = drafts[key] ?? "";
            const original = (t.content as string) ?? "";
            const dirty = value !== original;
            return (
              <div key={key} className="glass-card rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h2 className="font-display font-semibold text-lg">{label}</h2>
                    <p className="text-xs text-muted-foreground">
                      Variáveis disponíveis:{" "}
                      <code className="text-primary">{VARIABLES_HELP[key] ?? "—"}</code>
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={!dirty || save.isPending}
                    onClick={() => save.mutate({ key, content: value })}
                  >
                    {save.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Salvar
                  </Button>
                </div>
                <Textarea
                  value={value}
                  onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
