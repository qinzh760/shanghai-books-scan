import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, formatSEK } from "@/components/ui-helpers";
import { FileText, Receipt, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const year = new Date().getFullYear();
      const [verifs, receipts, lines] = await Promise.all([
        supabase.from("verifications").select("id", { count: "exact", head: true }).eq("fiscal_year", year),
        supabase.from("receipts").select("id,total_amount,status"),
        supabase
          .from("verification_lines")
          .select("debit,credit,account_number,verifications!inner(fiscal_year)")
          .eq("verifications.fiscal_year", year),
      ]);

      let income = 0;
      let expense = 0;
      for (const l of lines.data ?? []) {
        const n = (l as { account_number: number }).account_number;
        const debit = Number((l as { debit: number }).debit);
        const credit = Number((l as { credit: number }).credit);
        if (n >= 3000 && n < 4000) income += credit - debit;
        if (n >= 4000 && n < 8000) expense += debit - credit;
      }
      const pending = (receipts.data ?? []).filter((r) => r.status === "pending").length;

      return {
        verifCount: verifs.count ?? 0,
        receiptCount: receipts.data?.length ?? 0,
        pending,
        income,
        expense,
        result: income - expense,
      };
    },
  });

  return (
    <>
      <PageHeader title="Översikt" description={`Bokföringsår ${new Date().getFullYear()}`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Intäkter" value={formatSEK(stats?.income ?? 0)} tone="success" />
        <Stat label="Kostnader" value={formatSEK(stats?.expense ?? 0)} tone="warning" />
        <Stat
          label="Resultat"
          value={formatSEK(stats?.result ?? 0)}
          tone={(stats?.result ?? 0) >= 0 ? "success" : "destructive"}
        />
        <Stat label="Verifikationer" value={String(stats?.verifCount ?? 0)} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" /> Bokföring
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Skapa nya verifikationer med dubbel bokföring.
            </p>
            <Button asChild variant="secondary" size="sm">
              <Link to="/verifikationer">Öppna verifikationer <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4 text-primary" /> Kvitton
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {stats?.pending ?? 0} obearbetade kvitton. Ladda upp en bild så fyller AI i resten.
            </p>
            <Button asChild variant="secondary" size="sm">
              <Link to="/kvitton">Öppna kvitton <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning" | "destructive";
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "destructive"
          ? "text-destructive"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-2 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
