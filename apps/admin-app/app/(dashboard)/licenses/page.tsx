'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Search, KeyRound, Copy, Check, MoreVertical, Download, ArrowUpDown } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useDebounce } from '@/lib/use-debounce';
import { useSelection } from '@/lib/use-selection';
import { downloadCsv } from '@/lib/csv';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { Pagination } from '@/components/ui/pagination';
import { DeleteMenuItems, DeleteDialogs, useConfirmDelete } from '@/components/ui/confirm-delete-menu';
import { BulkDeleteBar } from '@/components/ui/bulk-delete-bar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';

type Client = {
  id: string;
  device_id_hash: string;
  tenant_name: string;
  contact_phone: string;
  plan: 'lite' | 'pro';
  status: string;
  license_key: string | null;
  created_at: string;
  deleted_at: string | null;
};

type FilterKey = 'all' | 'trial' | 'active' | 'expired';
type SortKey = 'created_at' | 'tenant_name' | 'status';

function statusInfo(status: string): { tone: BadgeTone; label: string } {
  if (status === 'trial') return { tone: 'trial', label: 'Trial' };
  if (status === 'active_lite') return { tone: 'active', label: 'Lite' };
  if (status === 'active_pro') return { tone: 'active', label: 'Pro' };
  if (status === 'expired') return { tone: 'expired', label: 'Habis' };
  if (status === 'revoked') return { tone: 'inactive', label: 'Non-aktif' };
  return { tone: 'inactive', label: status };
}

function GenerateModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const qc = useQueryClient();
  const [plan, setPlan] = useState<'lite' | 'pro'>(client.plan ?? 'lite');
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/admin/offline/licenses/generate`, {
        method: 'POST',
        body: JSON.stringify({ client_id: client.id, plan }),
      }),
    onSuccess: (data) => {
      setResult(data.license_key);
      qc.invalidateQueries({ queryKey: ['offline-clients'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function copyKey() {
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    toast.success('Kode lisensi disalin.');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {result ? (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--status-active)]/15">
              <KeyRound className="h-5 w-5 text-[var(--status-active)]" aria-hidden />
            </div>
            <DialogTitle>Lisensi Diterbitkan</DialogTitle>
            <DialogDescription className="mb-4">{client.tenant_name}</DialogDescription>
            <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <p className="font-mono text-lg font-bold tracking-wider text-[var(--primary)]">{result}</p>
            </div>
            <Button onClick={copyKey} variant="outline" className="mb-2 w-full">
              {copied ? <><Check className="h-4 w-4" /> Tersalin</> : <><Copy className="h-4 w-4" /> Salin Kode</>}
            </Button>
            <Button onClick={onClose} className="w-full">Selesai</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Generate Lisensi</DialogTitle>
              <DialogDescription>{client.tenant_name}</DialogDescription>
            </DialogHeader>
            <div className="mb-2 flex gap-2" role="radiogroup" aria-label="Pilih paket">
              {(['lite', 'pro'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={plan === p}
                  onClick={() => setPlan(p)}
                  className={`flex-1 rounded-xl border py-2.5 text-sm font-display font-semibold transition-colors ${
                    plan === p
                      ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-ink)]'
                      : 'border-[var(--border)] text-[var(--muted)]'
                  }`}
                >
                  {p === 'lite' ? 'Lite · Rp299k' : 'Pro · Rp499k'}
                </button>
              ))}
            </div>
            {client.license_key && (
              <p className="mb-4 text-xs text-[var(--status-trial)]">Sudah ada lisensi. Generate ulang akan mengganti kode lama.</p>
            )}
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1">Batal</Button>
              <Button onClick={() => mut.mutate()} disabled={mut.isPending} className="flex-1">
                {mut.isPending ? 'Memproses...' : 'Generate'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const qc = useQueryClient();
  const [storeName, setStoreName] = useState(client.tenant_name);
  const [phone, setPhone] = useState(client.contact_phone);

  const mut = useMutation({
    mutationFn: () => apiFetch(`/api/v1/admin/offline/clients/${client.id}`, {
      method: 'PATCH', body: JSON.stringify({ store_name: storeName, phone }),
    }),
    onSuccess: () => {
      toast.success(`${storeName} diperbarui.`);
      qc.invalidateQueries({ queryKey: ['offline-clients'] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Klien</DialogTitle>
          <DialogDescription>{client.tenant_name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="client-store">Nama Toko</Label>
            <Input id="client-store" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="client-phone">Telepon</Label>
            <Input id="client-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Batal</Button>
            <Button onClick={() => mut.mutate()} disabled={mut.isPending || (!storeName.trim())} className="flex-1">
              {mut.isPending ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ActionMenu({ client, isSuperAdmin, onEdit, onGenerate, onRefresh }: {
  client: Client; isSuperAdmin: boolean; onEdit: () => void; onGenerate: () => void; onRefresh: () => void;
}) {
  const confirmDelete = useConfirmDelete();

  async function act(path: string, method: string, successMsg: string) {
    try {
      await apiFetch(`/api/v1/admin/offline/clients/${client.id}${path}`, { method });
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
          {!client.deleted_at && (
            <>
              <DropdownMenuItem onClick={onGenerate}>Generate Lisensi</DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
            </>
          )}
          <DeleteMenuItems
            state={confirmDelete}
            deleted={!!client.deleted_at}
            isSuperAdmin={isSuperAdmin}
            onRestore={() => act('/restore', 'POST', `${client.tenant_name} dipulihkan.`)}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteDialogs
        state={confirmDelete}
        name={client.tenant_name}
        hardDeleteWarning="Tindakan ini permanen dan tidak bisa dibatalkan. Kalau klien masih punya riwayat lisensi, hapus lisensinya dulu."
        onDelete={() => act('', 'DELETE', `${client.tenant_name} dihapus. Bisa dipulihkan lewat "Tampilkan yang dihapus".`)}
        onHardDelete={() => act('/hard', 'DELETE', `${client.tenant_name} dihapus permanen.`)}
      />
    </>
  );
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Semua status' },
  { key: 'trial', label: 'Trial' },
  { key: 'active', label: 'Aktif' },
  { key: 'expired', label: 'Habis' },
];

const PAGE_SIZE = 20;

export default function LicensesPage() {
  const me = useAuthStore((s) => s.user);
  const isSuperAdmin = me?.role === 'super_admin';
  const qc = useQueryClient();
  const [generating, setGenerating] = useState<Client | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [showDeleted, setShowDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'created_at', dir: 'desc' });

  const { data, isLoading } = useQuery<{ data: Client[]; total: number }>({
    queryKey: ['offline-clients', showDeleted, page],
    queryFn: () => apiFetch(`/api/v1/admin/offline/clients?page=${page}&limit=${PAGE_SIZE}${showDeleted ? '&includeDeleted=1' : ''}`),
  });

  const clients = data?.data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ['offline-clients'] });
  const selection = useSelection(clients);

  const stats = useMemo(
    () => ({
      trial: clients.filter((c) => c.status === 'trial').length,
      active: clients.filter((c) => c.status === 'active_lite' || c.status === 'active_pro').length,
      expired: clients.filter((c) => c.status === 'expired').length,
      inactive: clients.filter((c) => c.status === 'revoked').length,
    }),
    [clients]
  );

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    const rows = clients.filter((c) => {
      const matchesSearch = !q || c.tenant_name.toLowerCase().includes(q) || c.contact_phone.includes(q) || c.device_id_hash.toLowerCase().includes(q);
      const matchesFilter =
        filter === 'all' ||
        (filter === 'active' ? c.status === 'active_lite' || c.status === 'active_pro' : c.status === filter);
      return matchesSearch && matchesFilter;
    });
    const sorted = [...rows].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [clients, debouncedSearch, filter, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  function exportCsv() {
    downloadCsv('lisensi-offline.csv', filtered.map((c) => ({
      Toko: c.tenant_name, Telepon: c.contact_phone, Status: statusInfo(c.status).label,
      Lisensi: c.license_key ?? '', Daftar: c.created_at.slice(0, 10),
    })));
  }

  async function bulkSoftDelete() {
    try {
      const ids = [...selection.selected];
      await apiFetch('/api/v1/admin/offline/clients/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
      toast.success(`${ids.length} klien dihapus. Bisa dipulihkan lewat "Tampilkan yang dihapus".`);
      selection.clear();
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function bulkHardDelete() {
    try {
      const ids = [...selection.selected];
      const res = await apiFetch('/api/v1/admin/offline/clients/bulk-delete/hard', { method: 'POST', body: JSON.stringify({ ids }) });
      toast.success(
        res.skipped
          ? `${res.count} klien dihapus permanen. ${res.skipped} dilewati karena masih punya riwayat lisensi.`
          : `${res.count} klien dihapus permanen.`
      );
      selection.clear();
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div>
      <h1 className="mb-1 font-display text-xl font-bold text-[var(--ink)]">Lisensi Offline</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">Kelola klien kasir offline dan generate kode lisensi.</p>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Klien Trial" value={stats.trial} tone="trial" />
        <StatCard label="Klien Aktif" value={stats.active} tone="active" />
        <StatCard label="Lisensi Habis" value={stats.expired} tone="expired" />
        <StatCard label="Non-aktif" value={stats.inactive} tone="inactive" />
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama toko, device ID, atau telepon..."
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
          <SelectTrigger className="md:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => (
              <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        onSoftDelete={bulkSoftDelete}
        onHardDelete={bulkHardDelete}
        onClear={selection.clear}
      />

      {isLoading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-sm text-[var(--muted)]">
            {clients.length === 0 ? 'Belum ada pendaftaran klien offline.' : 'Tidak ada klien yang cocok dengan pencarian.'}
          </p>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input type="checkbox" checked={selection.allSelected} onChange={selection.toggleAll} className="h-4 w-4 rounded border-[var(--border)]" />
                  </TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1" onClick={() => toggleSort('tenant_name')}>Toko <ArrowUpDown className="h-3 w-3" /></button>
                  </TableHead>
                  <TableHead>Kontak</TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1" onClick={() => toggleSort('status')}>Status <ArrowUpDown className="h-3 w-3" /></button>
                  </TableHead>
                  <TableHead>License Key</TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1" onClick={() => toggleSort('created_at')}>Daftar <ArrowUpDown className="h-3 w-3" /></button>
                  </TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const info = statusInfo(c.status);
                  return (
                    <TableRow key={c.id} className={c.deleted_at ? 'opacity-50' : undefined}>
                      <TableCell>
                        <input type="checkbox" checked={selection.selected.has(c.id)} onChange={() => selection.toggle(c.id)} className="h-4 w-4 rounded border-[var(--border)]" />
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-[var(--ink)]">{c.tenant_name}</p>
                        <p className="font-mono text-[10px] text-[var(--muted)]">{c.device_id_hash.slice(0, 16)}…</p>
                      </TableCell>
                      <TableCell className="text-[var(--muted)]">{c.contact_phone || '-'}</TableCell>
                      <TableCell><Badge tone={info.tone}>{info.label}</Badge></TableCell>
                      <TableCell className="font-mono text-xs text-[var(--ink)]">{c.license_key ?? '-'}</TableCell>
                      <TableCell className="text-[var(--muted)]">{c.created_at.slice(0, 10)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!c.deleted_at && (
                            <Button size="sm" variant="outline" onClick={() => setGenerating(c)}>
                              <KeyRound className="h-3.5 w-3.5" /> Generate
                            </Button>
                          )}
                          <ActionMenu client={c} isSuperAdmin={isSuperAdmin} onEdit={() => setEditing(c)} onGenerate={() => setGenerating(c)} onRefresh={refresh} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile stacked cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((c) => {
              const info = statusInfo(c.status);
              return (
                <Card key={c.id} className={`p-4 ${c.deleted_at ? 'opacity-50' : ''}`}>
                  <div className="mb-2 flex items-start gap-2">
                    <input type="checkbox" checked={selection.selected.has(c.id)} onChange={() => selection.toggle(c.id)} className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--border)]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[var(--ink)]">{c.tenant_name}</p>
                          <p className="text-xs text-[var(--muted)]">{c.contact_phone || '-'}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge tone={info.tone}>{info.label}</Badge>
                          <ActionMenu client={c} isSuperAdmin={isSuperAdmin} onEdit={() => setEditing(c)} onGenerate={() => setGenerating(c)} onRefresh={refresh} />
                        </div>
                      </div>
                      {c.license_key && (
                        <p className="mt-2 font-mono text-xs text-[var(--ink)]">{c.license_key}</p>
                      )}
                      <p className="mt-1 font-mono text-[10px] text-[var(--muted)]">{c.device_id_hash.slice(0, 20)}…</p>
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-[11px] text-[var(--muted)]">Daftar {c.created_at.slice(0, 10)}</p>
                        {!c.deleted_at && (
                          <Button size="sm" variant="outline" onClick={() => setGenerating(c)}>
                            <KeyRound className="h-3.5 w-3.5" /> Generate
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <Pagination page={page} limit={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
        </>
      )}

      {generating && <GenerateModal client={generating} onClose={() => setGenerating(null)} />}
      {editing && <EditModal client={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
