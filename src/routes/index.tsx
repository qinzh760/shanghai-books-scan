import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace("/dashboard");
      else window.location.replace("/login");
      setChecked(true);
    });
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-muted-foreground text-sm">Laddar…</div>
    </div>
  );
}
