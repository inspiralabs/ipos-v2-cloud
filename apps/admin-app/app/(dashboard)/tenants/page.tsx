'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Search, MoreVertical, Building2, Copy, Check, Download, ArrowUpDown } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useDebounce } from '@/lib/use-debounce';
import { useSelection } from '@/lib/use-selection';
import { downloadCsv } from '@/lib/csv';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { Pagination } from '@/components/ui/pagination';
import { BulkDeleteBar } from '@/components/ui/bulk-delete-bar';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';

type SortKey = 'created_at' | 'name' | 'status';

function trialDaysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  email: string;
  trial_ends_at: string | null;
  created_at: string;
  deleted_at: string | null;
};

function statusInfo(status: string): { tone: BadgeTone; label: string } {
  if (status === 'trial') return { tone: 'trial', label: 'Trial' };
  if (status === 'active') return { tone: 'active', label: 'Aktif' };
  if (status === 'suspended') return { tone: 'expired', label: 'Suspend' };
  if (status === 'terminated') return { tone: 'inactive', label: 'Terminated' };
  return { tone: 'inactive', label: status };
}

/** Tenant baru selalu masuk trial 14 hari (default backend) — sama seperti Offline. */
function CreateTenantDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [result, setResult] = useState<{ name: string; owner_temp_password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const mut = useMutation({
    mutationFn: (fd: FormData) => apiFetch('/api/v1/admin/tenants', {
      method: 'POST',
      body: JSON.stringify({ name: fd.get('name'), email: fd.get('email'), phone: fd.get('phone') || undefined }),
    }),
    onSuccess: (data) => {
      setResult({ name: data.name, owner_temp_password: data.owner_temp_password });
      qc.invalidateQueries({ queryKey: ['tenants'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function copyPassword() {
    if (!result) return;
    navigator.clipboard.writeText(result.owner_temp_password);
    setCopied(true);
    toast.success('Password disalin.');
    setTimeout(() => setCopied(false), 2000);
  }

  function close(o: boolean) {
    onOpenChange(o);
    if (!o) setTimeout(() => setResult(null), 200); // biar tidak kelihatan kosong pas animasi tutup
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        {result ? (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--status-active)]/15">
              <Check className="h-5 w-5 text-[var(--status-active)]" aria-hidden />
            </div>
            <DialogTitle>Tenant Dibuat — Trial 14 Hari</DialogTitle>
            <DialogDescription className="mb-4">{result.name}</DialogDescription>
            <p className="mb-2 text-xs text-[var(--muted)]">Password sementara pemilik toko — cuma muncul sekali di sini, kirim manual via WhatsApp/email sekarang:</p>
            <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <p className="font-mono text-lg font-bold tracking-wider text-[var(--primary)]">{result.owner_temp_password}</p>
            </div>
            <Button onClick={copyPassword} variant="outline" className="mb-2 w-full">
              {copied ? <><Check className="h-4 w-4" /> Tersalin</> : <><Copy className="h-4 w-4" /> Salin Password</>}
            </Button>
            <Button onClick={() => close(false)} className="w-full">Selesai</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Tenant Baru</DialogTitle>
              <DialogDescription>Langsung mulai trial 14 hari, akun pemilik dibuat otomatis.</DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => { e.preventDefault(); mut.mutate(new FormData(e.currentTarget)); }}
            >
              <div>
                <Label htmlFor="t-name">Nama Usaha</Label>
                <Input id="t-name" name="name" required autoFocus />
              </div>
              <div>
                <Label htmlFor="t-email">Email Pemilik</Label>
                <Input id="t-email" name="email" type="email" required />
              </div>
              <div>
                <Label htmlFor="t-phone">Nomor WhatsApp (opsional)</Label>
                <Input id="t-phone" name="phone" type="tel" />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => close(false)} className="flex-1">Batal</Button>
                <Button type="submit" disabled={mut.isPending} className="flex-1">{mut.isPending ? 'Membuat...' : 'Buat Tenant'}</Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Ketik ulang slug untuk konfirmasi — pengganti window.prompt() bawaan browser. */
function TerminateDialog({ tenant, open, onOpenChange, onConfirm }: {
  tenant: Tenant; open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void;
}) {
  const [typed, setTyped] = useState('');
  const matches = typed === tenant.slug;

  return (
    <AlertDialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setTyped(''); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Terminate {tenant.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Tindakan ini permanen. Ketik slug <span className="font-mono font-semibold text-[var(--ink)]">{tenant.slug}</span> untuk konfirmasi.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Label htmlFor="slug-confirm">Slug tenant</Label>
        <Input id="slug-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={tenant.slug} autoFocus />
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction disabled={!matches} onClick={onConfirm}>Terminate</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Sama seperti TerminateDialog (ketik ulang slug), tapi untuk hapus permanen — blast radius
 * lebih besar (cascade outlet/catalog/pos), jadi tetap pakai konfirmasi ketik, bukan cuma klik. */
function HardDeleteDialog({ tenant, open, onOpenChange, onConfirm }: {
  tenant: Tenant; open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void;
}) {
  const [typed, setTyped] = useState('');
  const matches = typed === tenant.slug;

  return (
    <AlertDialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setTyped(''); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus Permanen {tenant.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Semua data tenant ini (outlet, menu, transaksi) ikut terhapus dan tidak bisa dipulihkan.
            Ketik slug <span className="font-mono font-semibold text-[var(--ink)]">{tenant.slug}</span> untuk konfirmasi.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Label htmlFor="hard-slug-confirm">Slug tenant</Label>
        <Input id="hard-slug-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={tenant.slug} autoFocus />
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction disabled={!matches} onClick={onConfirm}>Hapus Permanen</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Wajib sinkron dengan PLAN_FEATURES di packages/shared/feature-gate.ts — nilai lain (mis. 'pro')
 * tidak dikenali gate manapun dan diam-diam mengunci semua fitur berbayar. */
const PLAN_OPTIONS = [
  { value: 'umkm_lite', label: 'UMKM Lite' },
  { value: 'umkm_pro', label: 'UMKM Pro' },
  { value: 'resto_basic', label: 'Resto Basic' },
  { value: 'resto_starter', label: 'Resto Starter' },
  { value: 'resto_pro', label: 'Resto Pro' },
  { value: 'resto_business', label: 'Resto Business' },
] as const;

/** Add-on: fitur di luar bawaan tier, dinyalakan per tenant lewat tenant_feature_overrides.
 * Key harus match salah satu feature_key di packages/shared/feature-gate.ts PLAN_FEATURES. */
const ADDON_OPTIONS = [
  { key: 'stock_management', label: 'Dashboard Stok Real-time' },
  { key: 'advanced_report', label: 'Food Cost / HPP Otomatis' },
  { key: 'qr_self_order', label: 'QR Self-Order' },
  { key: 'kitchen_display', label: 'KDS Dapur' },
  { key: 'loyalty_program', label: 'Loyalty Program' },
  { key: 'inter_branch_transfer', label: 'Inter-branch Transfer' },
  { key: 'absensi', label: 'Absensi Karyawan' },
] as const;

function EditTenantDialog({ tenant, open, onOpenChange }: { tenant: Tenant; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(tenant.name);
  const knownPlan = PLAN_OPTIONS.some((p) => p.value === tenant.plan);
  const [plan, setPlan] = useState(tenant.plan);

  const { data: overrides = [] } = useQuery({
    queryKey: ['tenant-overrides', tenant.id],
    queryFn: () => apiFetch(`/api/v1/admin/tenants/${tenant.id}/feature-overrides`),
    enabled: open,
  });
  const overrideMap = new Map<string, boolean>(overrides.map((o: { feature_key: string; is_enabled: boolean }): [string, boolean] => [o.feature_key, o.is_enabled]));

  const toggleAddon = useMutation({
    mutationFn: ({ feature_key, is_enabled }: { feature_key: string; is_enabled: boolean }) =>
      apiFetch(`/api/v1/admin/tenants/${tenant.id}/feature-overrides/${feature_key}`, {
        method: 'PUT', body: JSON.stringify({ is_enabled }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-overrides', tenant.id] });
      toast.success('Add-on diperbarui');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const mut = useMutation({
    mutationFn: async () => {
      await apiFetch(`/api/v1/admin/tenants/${tenant.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      if (plan !== tenant.plan) {
        await apiFetch(`/api/v1/admin/tenants/${tenant.id}/change-plan`, { method: 'POST', body: JSON.stringify({ plan_code: plan }) });
      }
    },
    onSuccess: () => {
      toast.success('Tenant diperbarui');
      qc.invalidateQueries({ queryKey: ['tenants'] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Tenant</DialogTitle>
          <DialogDescription>{tenant.slug}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-t-name">Nama Usaha</Label>
            <Input id="edit-t-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label htmlFor="edit-t-plan">Plan</Label>
            {!knownPlan && (
              <p className="mb-1.5 text-xs text-[var(--status-expired)]">
                Nilai plan saat ini (&ldquo;{tenant.plan}&rdquo;) tidak dikenali sistem fitur — semua fitur berbayar akan terkunci sampai diganti ke salah satu paket di bawah.
              </p>
            )}
            <Select value={knownPlan ? plan : undefined} onValueChange={setPlan}>
              <SelectTrigger id="edit-t-plan">
                <SelectValue placeholder="Pilih paket" />
              </SelectTrigger>
              <SelectContent>
                {PLAN_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Add-On</Label>
            <p className="mb-2 text-xs text-[var(--muted)]">Fitur di luar paket, dinyalakan terpisah per tenant.</p>
            <div className="space-y-2">
              {ADDON_OPTIONS.map((addon) => {
                const enabled = overrideMap.get(addon.key) ?? false;
                return (
                  <label key={addon.key} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                    {addon.label}
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => toggleAddon.mutate({ feature_key: addon.key, is_enabled: e.target.checked })}
                    />
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Batal</Button>
            <Button onClick={() => mut.mutate()} disabled={mut.isPending || !name.trim() || !plan} className="flex-1">
              {mut.isPending ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Backend wajib alasan (min 3 karakter) untuk suspend — pengganti prompt() juga. */
function SuspendDialog({ tenant, open, onOpenChange, onConfirm }: {
  tenant: Tenant; open: boolean; onOpenChange: (open: boolean) => void; onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= 3;

  return (
    <AlertDialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setReason(''); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Suspend {tenant.name}?</AlertDialogTitle>
          <AlertDialogDescription>Toko tidak bisa akses dashboard sampai diaktifkan lagi. Tulis alasannya.</AlertDialogDescription>
        </AlertDialogHeader>
        <Label htmlFor="suspend-reason">Alasan</Label>
        <Input id="suspend-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contoh: menunggak pembayaran" autoFocus />
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction disabled={!valid} onClick={() => onConfirm(reason.trim())}>Suspend</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Jaring pengaman terakhir — dipakai kalau owner lupa password DAN tidak akses email
 * (jalur self-service forgot-password di tenant-app gagal). Password baru digenerate
 * backend, bukan input admin — sama seperti alur create tenant. */
function ResetOwnerPasswordDialog({ tenant, open, onOpenChange }: {
  tenant: Tenant; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const mut = useMutation({
    mutationFn: () => apiFetch(`/api/v1/admin/tenants/${tenant.id}/reset-owner-password`, { method: 'POST' }),
    onSuccess: (data) => setResult(data.owner_temp_password),
    onError: (e: any) => toast.error(e.message),
  });

  function copyPassword() {
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    toast.success('Password disalin.');
    setTimeout(() => setCopied(false), 2000);
  }

  function close(o: boolean) {
    onOpenChange(o);
    if (!o) setTimeout(() => setResult(null), 200);
  }

  return (
    <AlertDialog open={open} onOpenChange={close}>
      <AlertDialogContent>
        {result ? (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--status-active)]/15">
              <Check className="h-5 w-5 text-[var(--status-active)]" aria-hidden />
            </div>
            <AlertDialogTitle>Password Diperbarui</AlertDialogTitle>
            <AlertDialogDescription className="mb-4">
              Password pemilik toko {tenant.name} — cuma muncul sekali di sini, kirim manual via WhatsApp/email sekarang:
            </AlertDialogDescription>
            <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <p className="font-mono text-lg font-bold tracking-wider text-[var(--primary)]">{result}</p>
            </div>
            <Button onClick={copyPassword} variant="outline" className="mb-2 w-full">
              {copied ? <><Check className="h-4 w-4" /> Tersalin</> : <><Copy className="h-4 w-4" /> Salin Password</>}
            </Button>
            <Button onClick={() => close(false)} className="w-full">Selesai</Button>
          </div>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset Password Pemilik Toko?</AlertDialogTitle>
              <AlertDialogDescription>
                Password lama {tenant.name} langsung tidak berlaku. Gunakan ini hanya kalau owner tidak bisa pakai "Lupa Password" sendiri (mis. tidak akses email lagi).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction disabled={mut.isPending} onClick={() => mut.mutate()}>
                {mut.isPending ? 'Memproses...' : 'Reset Password'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ActionMenu({ tenant, isSuperAdmin, onEdit, onRefresh }: {
  tenant: Tenant; isSuperAdmin: boolean; onEdit: () => void; onRefresh: () => void;
}) {
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);

  async function act(path: string, method: string, successMsg: string, body?: Record<string, unknown>) {
    try {
      await apiFetch(`/api/v1/admin/tenants/${tenant.id}${path}`, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      toast.success(successMsg);
      onRefresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button aria-label="Aksi lainnya" className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {tenant.deleted_at ? (
            <DropdownMenuItem onClick={() => act('/restore', 'POST', `${tenant.name} dipulihkan.`)}>Pulihkan</DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
              {tenant.status === 'trial' && <DropdownMenuItem onClick={() => act('/activate', 'POST', `${tenant.name} diaktifkan.`)}>Aktifkan</DropdownMenuItem>}
              {tenant.status === 'active' && <DropdownMenuItem destructive onClick={() => setSuspendOpen(true)}>Suspend</DropdownMenuItem>}
              {tenant.status === 'suspended' && <DropdownMenuItem onClick={() => act('/unsuspend', 'POST', `${tenant.name} diaktifkan kembali.`)}>Aktifkan Lagi</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setResetPasswordOpen(true)}>Reset Password Owner</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onClick={() => setTerminateOpen(true)}>Terminate</DropdownMenuItem>
              <DropdownMenuItem destructive onClick={() => setDeleteOpen(true)}>Hapus</DropdownMenuItem>
            </>
          )}
          {isSuperAdmin && <DropdownMenuItem destructive onClick={() => setHardDeleteOpen(true)}>Hapus Permanen</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      <SuspendDialog
        tenant={tenant}
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        onConfirm={(reason) => { act('/suspend', 'POST', `${tenant.name} disuspend.`, { reason }); setSuspendOpen(false); }}
      />
      <TerminateDialog
        tenant={tenant}
        open={terminateOpen}
        onOpenChange={setTerminateOpen}
        onConfirm={() => { act('', 'DELETE', `${tenant.name} diterminasi.`, { confirm_slug: tenant.slug }); setTerminateOpen(false); }}
      />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {tenant.name}?</AlertDialogTitle>
            <AlertDialogDescription>Tenant hilang dari daftar tapi masih bisa dipulihkan nanti. Beda dari Terminate — status bisnis tenant tidak berubah.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { act('/soft', 'DELETE', `${tenant.name} dihapus. Bisa dipulihkan lewat "Tampilkan yang dihapus".`); setDeleteOpen(false); }}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <HardDeleteDialog
        tenant={tenant}
        open={hardDeleteOpen}
        onOpenChange={setHardDeleteOpen}
        onConfirm={() => { act('/hard', 'DELETE', `${tenant.name} dihapus permanen.`, { confirm_slug: tenant.slug }); setHardDeleteOpen(false); }}
      />
      <ResetOwnerPasswordDialog tenant={tenant} open={resetPasswordOpen} onOpenChange={setResetPasswordOpen} />
    </>
  );
}

const PAGE_SIZE = 20;

export default function TenantsPage() {
  const me = useAuthStore((s) => s.user);
  const isSuperAdmin = me?.role === 'super_admin';
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'created_at', dir: 'desc' });

  const { data, isLoading } = useQuery<{ data: Tenant[]; total: number }>({
    queryKey: ['tenants', showDeleted, page],
    queryFn: () => apiFetch(`/api/v1/admin/tenants?page=${page}&limit=${PAGE_SIZE}${showDeleted ? '&includeDeleted=1' : ''}`),
  });

  const tenants = data?.data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ['tenants'] });
  const selection = useSelection(tenants);

  const stats = useMemo(
    () => ({
      trial: tenants.filter((t) => t.status === 'trial').length,
      active: tenants.filter((t) => t.status === 'active').length,
      suspended: tenants.filter((t) => t.status === 'suspended').length,
      terminated: tenants.filter((t) => t.status === 'terminated').length,
    }),
    [tenants]
  );

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    const rows = !q ? tenants : tenants.filter((t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q) || t.email.toLowerCase().includes(q));
    return [...rows].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [tenants, debouncedSearch, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  function exportCsv() {
    downloadCsv('tenants.csv', filtered.map((t) => ({
      Nama: t.name, Slug: t.slug, Plan: t.plan, Status: statusInfo(t.status).label,
      Email: t.email, Daftar: t.created_at.slice(0, 10),
    })));
  }

  async function bulkSoftDelete() {
    try {
      const ids = [...selection.selected];
      await apiFetch('/api/v1/admin/tenants/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
      toast.success(`${ids.length} tenant dihapus. Bisa dipulihkan lewat "Tampilkan yang dihapus".`);
      selection.clear();
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function bulkHardDelete() {
    try {
      const ids = [...selection.selected];
      await apiFetch('/api/v1/admin/tenants/bulk-delete/hard', { method: 'POST', body: JSON.stringify({ ids, confirm_text: 'HAPUS PERMANEN' }) });
      toast.success(`${ids.length} tenant dihapus permanen.`);
      selection.clear();
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 font-display text-xl font-bold text-[var(--ink)]">Tenant</h1>
          <p className="text-sm text-[var(--muted)]">Kelola klien Inspira POS Cloud (UMKM & FnB).</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Building2 className="h-4 w-4" /> Tenant Baru</Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Trial" value={stats.trial} tone="trial" />
        <StatCard label="Aktif" value={stats.active} tone="active" />
        <StatCard label="Suspend" value={stats.suspended} tone="expired" />
        <StatCard label="Terminated" value={stats.terminated} tone="inactive" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, slug, atau email..." className="pl-9 md:max-w-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} className="h-4 w-4 rounded border-[var(--border)]" />
          Tampilkan yang dihapus
        </label>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      <BulkDeleteBar
        count={selection.selected.size}
        isSuperAdmin={isSuperAdmin}
        hardConfirmText="HAPUS PERMANEN"
        onSoftDelete={bulkSoftDelete}
        onHardDelete={bulkHardDelete}
        onClear={selection.clear}
      />

      {isLoading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-sm text-[var(--muted)]">{tenants.length === 0 ? 'Belum ada tenant.' : 'Tidak ada tenant yang cocok.'}</p>
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input type="checkbox" checked={selection.allSelected} onChange={selection.toggleAll} className="h-4 w-4 rounded border-[var(--border)]" />
                  </TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1" onClick={() => toggleSort('name')}>Nama <ArrowUpDown className="h-3 w-3" /></button>
                  </TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1" onClick={() => toggleSort('status')}>Status <ArrowUpDown className="h-3 w-3" /></button>
                  </TableHead>
                  <TableHead>Email Owner</TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1" onClick={() => toggleSort('created_at')}>Daftar <ArrowUpDown className="h-3 w-3" /></button>
                  </TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => {
                  const info = statusInfo(t.status);
                  const daysLeft = t.status === 'trial' ? trialDaysLeft(t.trial_ends_at) : null;
                  return (
                    <TableRow key={t.id} className={t.deleted_at ? 'opacity-50' : undefined}>
                      <TableCell>
                        <input type="checkbox" checked={selection.selected.has(t.id)} onChange={() => selection.toggle(t.id)} className="h-4 w-4 rounded border-[var(--border)]" />
                      </TableCell>
                      <TableCell className="font-medium text-[var(--ink)]">{t.name}</TableCell>
                      <TableCell className="font-mono text-xs text-[var(--muted)]">{t.slug}</TableCell>
                      <TableCell className="text-[var(--muted)]">{t.plan}</TableCell>
                      <TableCell>
                        <Badge tone={info.tone}>{info.label}</Badge>
                        {daysLeft !== null && (
                          <span className={`ml-1.5 text-xs ${daysLeft <= 3 ? 'text-[var(--status-expired)]' : 'text-[var(--muted)]'}`}>
                            {daysLeft > 0 ? `sisa ${daysLeft} hari` : 'berakhir'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-[var(--muted)]">{t.email}</TableCell>
                      <TableCell className="text-[var(--muted)]">{t.created_at.slice(0, 10)}</TableCell>
                      <TableCell className="text-right"><ActionMenu tenant={t} isSuperAdmin={isSuperAdmin} onEdit={() => setEditing(t)} onRefresh={refresh} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          <div className="space-y-3 md:hidden">
            {filtered.map((t) => {
              const info = statusInfo(t.status);
              const daysLeft = t.status === 'trial' ? trialDaysLeft(t.trial_ends_at) : null;
              return (
                <Card key={t.id} className={`p-4 ${t.deleted_at ? 'opacity-50' : ''}`}>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked={selection.selected.has(t.id)} onChange={() => selection.toggle(t.id)} className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--border)]" />
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[var(--ink)]">{t.name}</p>
                          <p className="font-mono text-xs text-[var(--muted)]">{t.slug}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge tone={info.tone}>{info.label}</Badge>
                          <ActionMenu tenant={t} isSuperAdmin={isSuperAdmin} onEdit={() => setEditing(t)} onRefresh={refresh} />
                        </div>
                      </div>
                      <p className="text-xs text-[var(--muted)]">{t.email}</p>
                      <p className="mt-1 text-[11px] text-[var(--muted)]">
                        Plan {t.plan} · Daftar {t.created_at.slice(0, 10)}
                        {daysLeft !== null && (
                          <span className={daysLeft <= 3 ? 'text-[var(--status-expired)]' : ''}> · {daysLeft > 0 ? `sisa ${daysLeft} hari` : 'trial berakhir'}</span>
                        )}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <Pagination page={page} limit={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
        </>
      )}

      <CreateTenantDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing && <EditTenantDialog tenant={editing} open onOpenChange={(o) => !o && setEditing(null)} />}
    </div>
  );
}
