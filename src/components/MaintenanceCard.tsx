import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useMaintenance } from "./MaintenanceBanner";

export function MaintenanceCard() {
  const { data } = useMaintenance();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) { setEnabled(data.enabled); setMessage(data.message); }
  }, [data]);

  async function save() {
    setBusy(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from("site_settings").upsert([
      { key: "maintenance_enabled", value: enabled ? "true" : "false", updated_at: now },
      { key: "maintenance_message", value: message.trim() || "Estamos em manutenção. Voltamos em breve!", updated_at: now },
    ]);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Modo manutenção salvo.");
    qc.invalidateQueries({ queryKey: ["maintenance"] });
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">Modo manutenção</h2>
          <p className="text-xs text-muted-foreground">Mostra um aviso no site e pausa novos pedidos dos clientes.</p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
      <div className="space-y-2">
        <Label>Mensagem do aviso</Label>
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={300} />
      </div>
      <Button onClick={save} disabled={busy}>Salvar</Button>
    </div>
  );
}
