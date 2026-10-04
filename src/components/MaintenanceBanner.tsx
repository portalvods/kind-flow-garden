import { useQuery } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function useMaintenance() {
  return useQuery({
    queryKey: ["maintenance"],
    queryFn: async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", ["maintenance_enabled", "maintenance_message"]);
      const map: Record<string, string> = {};
      for (const r of data ?? []) if (r.value != null) map[r.key] = r.value;
      return { enabled: map.maintenance_enabled === "true", message: map.maintenance_message ?? "" };
    },
    refetchInterval: 60000,
  });
}

export function MaintenanceBanner() {
  const { data } = useMaintenance();
  if (!data?.enabled) return null;
  return (
    <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-200 text-sm">
      <div className="mx-auto max-w-7xl px-4 py-2 flex items-center gap-2 justify-center text-center">
        <Wrench className="h-4 w-4 shrink-0" />
        <span>{data.message || "Estamos em manutenção. Voltamos em breve!"}</span>
      </div>
    </div>
  );
}
