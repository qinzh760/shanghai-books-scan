import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, formatSEK, formatDate } from "@/components/ui-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Upload, Loader2, Camera, Plus } from "lucide-react";
import { extractReceipt } from "@/lib/receipts.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/kvitton")({
  component: KvittonPage,
});

type ReceiptForm = {
  vendor: string;
  receipt_date: string;
  total_amount: string;
  vat_amount: string;
  notes: string;
  imagePath: string | null;
};

const emptyForm: ReceiptForm = {
  vendor: "",
  receipt_date: new Date().toISOString().slice(0, 10),
  total_amount: "",
  vat_amount: "",
  notes: "",
  imagePath: null,
};

function KvittonPage() {
  const qc = useQueryClient();
  const { canEdit } = useAuth();
  const [open, setOpen] = useState(false);

  const { data: receipts } = useQuery({
    queryKey: ["receipts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receipts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <PageHeader title="Kvitton" description="Ladda upp kvitton manuellt eller som bild – AI fyller i resten.">
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1.5" /> Nytt kvitto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nytt kvitto</DialogTitle>
              </DialogHeader>
              <NewReceipt onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["receipts"] }); }} />
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3">Datum</th>
                <th className="px-4 py-3">Leverantör</th>
                <th className="px-4 py-3 text-right">Summa</th>
                <th className="px-4 py-3 text-right">Moms</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {(receipts ?? []).map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5">{formatDate(r.receipt_date)}</td>
                  <td className="px-4 py-2.5">{r.vendor ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatSEK(r.total_amount)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {r.vat_amount ? formatSEK(r.vat_amount) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={r.status === "attached" ? "default" : "secondary"}>
                      {r.status === "pending" ? "Obearbetat" : r.status === "attached" ? "Bokfört" : "Bearbetat"}
                    </Badge>
                  </td>
                </tr>
              ))}
              {(receipts ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Inga kvitton ännu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

function NewReceipt({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState<ReceiptForm>(emptyForm);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const extract = useServerFn(extractReceipt);

  const onFile = async (file: File) => {
    setScanning(true);
    try {
      // Upload
      const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("receipts").upload(path, file);
      if (upErr) throw upErr;

      // Read base64
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => {
          const r = reader.result as string;
          res(r.split(",")[1]);
        };
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

      const result = await extract({ data: { imageBase64: base64, mimeType: file.type || "image/jpeg" } });
      if (!result.ok) {
        toast.error(result.error);
        setForm((f) => ({ ...f, imagePath: path }));
        return;
      }
      const d = result.data;
      setForm({
        vendor: d.vendor ?? "",
        receipt_date: d.receipt_date ?? new Date().toISOString().slice(0, 10),
        total_amount: d.total_amount != null ? String(d.total_amount) : "",
        vat_amount: d.vat_amount != null ? String(d.vat_amount) : "",
        notes: d.notes ?? "",
        imagePath: path,
      });
      toast.success("Kvittot inläst – kontrollera uppgifterna.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("receipts").insert({
        vendor: form.vendor || null,
        receipt_date: form.receipt_date || null,
        total_amount: form.total_amount ? Number(form.total_amount) : null,
        vat_amount: form.vat_amount ? Number(form.vat_amount) : null,
        notes: form.notes || null,
        image_path: form.imagePath,
        status: "processed",
        uploaded_by: user?.id,
      });
      if (error) throw error;
      toast.success("Kvitto sparat.");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Tabs defaultValue="photo">
      <TabsList className="grid grid-cols-2 w-full">
        <TabsTrigger value="photo"><Camera className="h-4 w-4 mr-1.5" /> Foto</TabsTrigger>
        <TabsTrigger value="manual">Manuell</TabsTrigger>
      </TabsList>
      <TabsContent value="photo" className="space-y-4 pt-4">
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
        >
          {scanning ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>AI läser kvittot…</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Upload className="h-6 w-6" />
              <span>Klicka för att ladda upp ett kvittofoto</span>
              <span className="text-xs">JPG, PNG eller HEIC</span>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          />
        </div>
        {form.imagePath && <ReceiptForm form={form} setForm={setForm} />}
      </TabsContent>
      <TabsContent value="manual" className="pt-4">
        <ReceiptForm form={form} setForm={setForm} />
      </TabsContent>

      <div className="flex justify-end gap-2 pt-4">
        <Button onClick={save} disabled={saving || !form.vendor || !form.total_amount}>
          {saving ? "Sparar…" : "Spara kvitto"}
        </Button>
      </div>
    </Tabs>
  );
}

function ReceiptForm({
  form,
  setForm,
}: {
  form: ReceiptForm;
  setForm: (f: ReceiptForm) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5 col-span-2">
        <Label>Leverantör</Label>
        <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Datum</Label>
        <Input type="date" value={form.receipt_date} onChange={(e) => setForm({ ...form, receipt_date: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Summa (SEK)</Label>
        <Input type="number" step="0.01" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Moms (SEK)</Label>
        <Input type="number" step="0.01" value={form.vat_amount} onChange={(e) => setForm({ ...form, vat_amount: e.target.value })} />
      </div>
      <div className="space-y-1.5 col-span-2">
        <Label>Anteckningar</Label>
        <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
    </div>
  );
}
