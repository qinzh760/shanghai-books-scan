import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

type AppRole = "admin" | "accountant" | "viewer";

export const Route = createFileRoute("/_app/anvandare")({
  component: UsersPage,
});

function UsersPage() {
  const { isAdmin, loading } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !isAdmin) nav({ to: "/dashboard" });
  }, [loading, isAdmin, nav]);

  const { data: users } = useQuery({
    queryKey: ["users-with-roles"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, created_at");
      if (error) throw error;
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const map = new Map<string, AppRole[]>();
      for (const r of roles ?? []) {
        const arr = map.get(r.user_id) ?? [];
        arr.push(r.role as AppRole);
        map.set(r.user_id, arr);
      }
      return (profiles ?? []).map((p) => ({ ...p, roles: map.get(p.id) ?? [] }));
    },
    enabled: !!isAdmin,
  });

  const setRole = async (userId: string, role: AppRole) => {
    try {
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
      toast.success("Roll uppdaterad.");
      qc.invalidateQueries({ queryKey: ["users-with-roles"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!isAdmin) return null;

  return (
    <>
      <PageHeader title="Användare" description="Hantera roller (admin, redovisare, visare)." />
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3">Namn</th>
                <th className="px-4 py-3">E-post</th>
                <th className="px-4 py-3 w-32">Aktuell roll</th>
                <th className="px-4 py-3 w-48">Ändra roll</th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5">{u.full_name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-2.5">
                    {u.roles.map((r) => (
                      <Badge key={r} variant="secondary" className="mr-1">{roleLabel(r)}</Badge>
                    ))}
                  </td>
                  <td className="px-4 py-2.5">
                    <Select onValueChange={(v) => setRole(u.id, v as AppRole)}>
                      <SelectTrigger><SelectValue placeholder="Välj roll…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administratör</SelectItem>
                        <SelectItem value="accountant">Redovisare</SelectItem>
                        <SelectItem value="viewer">Visare</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

function roleLabel(r: AppRole) {
  return r === "admin" ? "Administratör" : r === "accountant" ? "Redovisare" : "Visare";
}
