import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, formatSEK, formatDate } from "@/components/ui-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, FileUp, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { parseBankPdf, type BankTransaction } from "@/lib/bank.functions";
import { FEES, BANK_ACCOUNT, suggestSplits, splitTotal, describeSplit, type FeeKey, type Split } from "@/lib/fees";

export const Route = createFileRoute("/_app/verifikationer")({
  component: VerifPage,
});

type Line = { account_number: string; debit: string; credit: string; description: string };

function VerifPage() {
  const qc = useQueryClient();
  const { canEdit } = useAuth();
  const [open, setOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);

  const { data: list } = useQuery({
    queryKey: ["verifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("verifications")
        .select("*, verification_lines(debit, credit)")
        .order("verification_date", { ascending: false })
        .order("number", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <PageHeader title="Verifikationer" description="Bokföringsposter med dubbel bokföring (debet/kredit)">
        {canEdit && (
          <div className="flex gap-2">
            <Dialog open={bankOpen} onOpenChange={setBankOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><FileUp className="h-4 w-4 mr-1.5" /> Importera bankutdrag (PDF)</Button>
              </DialogTrigger>
              <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Importera bankutdrag</DialogTitle></DialogHeader>
                <BankImport onDone={() => { setBankOpen(false); qc.invalidateQueries({ queryKey: ["verifications"] }); }} />
              </DialogContent>
            </Dialog>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-1.5" /> Ny verifikation</Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader><DialogTitle>Ny verifikation</DialogTitle></DialogHeader>
                <NewVerification onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["verifications"] }); }} />
              </DialogContent>
            </Dialog>
          </div>
        )}
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3 w-20">Nr</th>
                <th className="px-4 py-3 w-28">Datum</th>
                <th className="px-4 py-3">Beskrivning</th>
                <th className="px-4 py-3 w-32 text-right">Belopp</th>
              </tr>
            </thead>
            <tbody>
              {(list ?? []).map((v) => {
                const sum = (v.verification_lines ?? []).reduce(
                  (s: number, l: { debit: number }) => s + Number(l.debit),
                  0,
                );
                return (
                  <tr key={v.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-mono">{v.series}{v.number}</td>
                    <td className="px-4 py-2.5">{formatDate(v.verification_date)}</td>
                    <td className="px-4 py-2.5">{v.description}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatSEK(sum)}</td>
                  </tr>
                );
              })}
              {(list ?? []).length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">Inga verifikationer ännu.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

function NewVerification({ onDone }: { onDone: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { account_number: "", debit: "", credit: "", description: "" },
    { account_number: "", debit: "", credit: "", description: "" },
  ]);
  const [saving, setSaving] = useState(false);

  const { data: accounts } = useQuery({
    queryKey: ["accounts-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("number,name").order("number");
      if (error) throw error;
      return data;
    },
  });

  const totals = useMemo(() => {
    let d = 0, c = 0;
    for (const l of lines) { d += Number(l.debit || 0); c += Number(l.credit || 0); }
    return { d, c, balanced: Math.abs(d - c) < 0.005 && d > 0 };
  }, [lines]);

  const setLine = (i: number, patch: Partial<Line>) => {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const save = async () => {
    if (!totals.balanced) { toast.error("Debet och kredit måste balansera."); return; }
    if (!description) { toast.error("Ange beskrivning."); return; }
    setSaving(true);
    try {
      const year = new Date(date).getFullYear();
      const { data: maxRow } = await supabase
        .from("verifications").select("number").eq("fiscal_year", year).eq("series", "A")
        .order("number", { ascending: false }).limit(1).maybeSingle();
      const nextNumber = (maxRow?.number ?? 0) + 1;

      const { data: { user } } = await supabase.auth.getUser();
      const { data: v, error } = await supabase.from("verifications").insert({
        series: "A",
        number: nextNumber,
        verification_date: date,
        description,
        fiscal_year: year,
        created_by: user?.id,
      }).select("id").single();
      if (error) throw error;

      const linesPayload = lines
        .filter((l) => l.account_number && (Number(l.debit) > 0 || Number(l.credit) > 0))
        .map((l, idx) => ({
          verification_id: v.id,
          account_number: Number(l.account_number),
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
          description: l.description || null,
          line_order: idx,
        }));
      const { error: lErr } = await supabase.from("verification_lines").insert(linesPayload);
      if (lErr) throw lErr;

      toast.success(`Verifikation A${nextNumber} sparad.`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Datum</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Beskrivning</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="t.ex. Lokalhyra mars" />
        </div>
      </div>

      <div>
        <div className="grid grid-cols-12 gap-2 text-xs uppercase text-muted-foreground mb-1.5 px-1">
          <div className="col-span-4">Konto</div>
          <div className="col-span-3">Text</div>
          <div className="col-span-2 text-right">Debet</div>
          <div className="col-span-2 text-right">Kredit</div>
          <div className="col-span-1" />
        </div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 mb-1.5">
            <div className="col-span-4">
              <Select value={l.account_number} onValueChange={(v) => setLine(i, { account_number: v })}>
                <SelectTrigger><SelectValue placeholder="Välj konto" /></SelectTrigger>
                <SelectContent>
                  {(accounts ?? []).map((a) => (
                    <SelectItem key={a.number} value={String(a.number)}>
                      {a.number} – {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input className="col-span-3" placeholder="Text" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
            <Input className="col-span-2 text-right" type="number" step="0.01" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} />
            <Input className="col-span-2 text-right" type="number" step="0.01" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} />
            <Button variant="ghost" size="icon" className="col-span-1" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, { account_number: "", debit: "", credit: "", description: "" }])}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Lägg till rad
        </Button>
      </div>

      <div className="flex justify-between items-center border-t pt-3 text-sm">
        <div className="text-muted-foreground">
          Debet: <span className="tabular-nums text-foreground">{formatSEK(totals.d)}</span>
          {" · "}
          Kredit: <span className="tabular-nums text-foreground">{formatSEK(totals.c)}</span>
          {" · "}
          {totals.balanced ? (
            <span className="text-success">Balanserad</span>
          ) : (
            <span className="text-destructive">Differens: {formatSEK(totals.d - totals.c)}</span>
          )}
        </div>
        <Button onClick={save} disabled={saving || !totals.balanced}>
          {saving ? "Sparar…" : "Spara verifikation"}
        </Button>
      </div>
    </div>
  );
}

// ============= Bank PDF import =============

type ParsedTx = BankTransaction & {
  selected: boolean;
  split: Split;
  candidates: Split[];
  description: string;
};

function BankImport({ onDone }: { onDone: () => void }) {
  const parsePdf = useServerFn(parseBankPdf);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [txs, setTxs] = useState<ParsedTx[]>([]);

  const onFile = async (file: File) => {
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      const res = await parsePdf({ data: { pdfBase64: base64 } });
      if (!res.ok) { toast.error(res.error); return; }
      const incoming = res.transactions.filter((t) => t.amount > 0);
      const parsed: ParsedTx[] = incoming.map((t) => {
        const candidates = suggestSplits(t.amount);
        return {
          ...t,
          selected: candidates.length > 0,
          split: candidates[0] ?? {},
          candidates,
          description: t.counterparty
            ? `Inbet. ${t.counterparty}`
            : t.description || "Inbetalning",
        };
      });
      setTxs(parsed);
      const matched = parsed.filter((t) => t.candidates.length > 0).length;
      toast.success(`${res.transactions.length} transaktioner – ${incoming.length} insättningar, ${matched} matchade.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const saveAll = async () => {
    const toSave = txs.filter((t) => t.selected && splitTotal(t.split) === t.amount);
    if (toSave.length === 0) { toast.error("Inga transaktioner valda eller belopp matchar inte."); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let created = 0;
      for (const tx of toSave) {
        const year = new Date(tx.date).getFullYear();
        const { data: maxRow } = await supabase
          .from("verifications").select("number").eq("fiscal_year", year).eq("series", "A")
          .order("number", { ascending: false }).limit(1).maybeSingle();
        const nextNumber = (maxRow?.number ?? 0) + 1;

        const { data: v, error } = await supabase.from("verifications").insert({
          series: "A", number: nextNumber, verification_date: tx.date,
          description: `${tx.description} – ${describeSplit(tx.split)}`,
          fiscal_year: year, created_by: user?.id,
        }).select("id").single();
        if (error) throw error;

        const lines: Array<{ verification_id: string; account_number: number; debit: number; credit: number; description: string | null; line_order: number }> = [];
        lines.push({
          verification_id: v.id, account_number: BANK_ACCOUNT,
          debit: tx.amount, credit: 0, description: tx.description, line_order: 0,
        });
        let order = 1;
        for (const key of Object.keys(tx.split) as FeeKey[]) {
          const qty = tx.split[key] ?? 0;
          if (qty <= 0) continue;
          lines.push({
            verification_id: v.id, account_number: FEES[key].account,
            debit: 0, credit: qty * FEES[key].price,
            description: `${qty}× ${FEES[key].label}`, line_order: order++,
          });
        }
        const { error: lErr } = await supabase.from("verification_lines").insert(lines);
        if (lErr) throw lErr;
        created++;
      }
      toast.success(`${created} verifikationer skapade.`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (txs.length === 0) {
    return (
      <div className="py-8">
        <label className="block border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:bg-muted/30">
          <input type="file" accept="application/pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <div>Läser bankutdraget…</div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <FileUp className="h-8 w-8 mx-auto text-muted-foreground" />
              <div className="font-medium">Välj PDF-fil med bankutdrag</div>
              <div className="text-xs text-muted-foreground">AI extraherar transaktioner och föreslår uppdelning enligt avgiftstabellen</div>
            </div>
          )}
        </label>
        <div className="mt-4 text-xs text-muted-foreground border-t pt-3">
          <div className="font-medium text-foreground mb-1">Avgiftstabell</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            {(Object.keys(FEES) as FeeKey[]).map((k) => (
              <div key={k}>{FEES[k].label}: {FEES[k].price} kr (konto {FEES[k].account})</div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        Granska föreslagen uppdelning. Avmarkera rader du inte vill bokföra eller välj annan kombination.
      </div>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 w-10"></th>
              <th className="px-3 py-2 w-24 text-left">Datum</th>
              <th className="px-3 py-2 text-left">Avsändare / text</th>
              <th className="px-3 py-2 w-28 text-right">Belopp</th>
              <th className="px-3 py-2 text-left">Uppdelning</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((tx, i) => {
              const total = splitTotal(tx.split);
              const match = total === tx.amount;
              return (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2 align-top">
                    <input type="checkbox" checked={tx.selected}
                      onChange={(e) => setTxs((arr) => arr.map((t, idx) => idx === i ? { ...t, selected: e.target.checked } : t))} />
                  </td>
                  <td className="px-3 py-2 align-top tabular-nums">{tx.date}</td>
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium">{tx.counterparty ?? "–"}</div>
                    <div className="text-xs text-muted-foreground">{tx.description}</div>
                  </td>
                  <td className="px-3 py-2 align-top text-right tabular-nums font-medium">{formatSEK(tx.amount)}</td>
                  <td className="px-3 py-2 align-top space-y-1.5">
                    {tx.candidates.length === 0 ? (
                      <span className="text-destructive text-xs">Ingen kombination matchar – välj manuellt nedan</span>
                    ) : (
                      <Select
                        value={JSON.stringify(tx.split)}
                        onValueChange={(v) => setTxs((arr) => arr.map((t, idx) => idx === i ? { ...t, split: JSON.parse(v) as Split } : t))}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {tx.candidates.map((c, ci) => (
                            <SelectItem key={ci} value={JSON.stringify(c)}>{describeSplit(c)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <div className="grid grid-cols-5 gap-1">
                      {(Object.keys(FEES) as FeeKey[]).map((k) => (
                        <div key={k} className="flex flex-col">
                          <label className="text-[10px] text-muted-foreground truncate" title={FEES[k].label}>{FEES[k].label}</label>
                          <Input className="h-7 text-xs px-1.5" type="number" min="0"
                            value={tx.split[k] ?? 0}
                            onChange={(e) => {
                              const n = Math.max(0, Number(e.target.value) || 0);
                              setTxs((arr) => arr.map((t, idx) => idx === i ? { ...t, split: { ...t.split, [k]: n } } : t));
                            }} />
                        </div>
                      ))}
                    </div>
                    <div className={`text-xs ${match ? "text-success" : "text-destructive"}`}>
                      Summa: {formatSEK(total)} {match ? "✓" : `(diff ${formatSEK(total - tx.amount)})`}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setTxs([])}>Avbryt</Button>
        <Button onClick={saveAll} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Sparar…</> : `Skapa ${txs.filter((t) => t.selected && splitTotal(t.split) === t.amount).length} verifikationer`}
        </Button>
      </div>
    </div>
  );
}
