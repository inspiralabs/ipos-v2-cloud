'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Search, ClipboardEdit, MoreVertical, Download, ArrowUpDown } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useDebounce } from '@/lib/use-debounce';
import { useSelection } from '@/lib/use-selection';
import { downloadCsv } from '@/lib/csv';
import { relativeDate } from '@/lib/format-date';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { Pagination } from '@/components/ui/pagination';
import { DeleteMenuItems, DeleteDialogs, useConfirmDelete } from '@/components/ui/confirm-delete-menu';
import { BulkDeleteBar } from '@/components/ui/bulk-delete-bar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';

type Lead = {
  id: string;
  name: string;
  business_name: string;
  phone: string;
  email: string | null;
  business_type: string | null;
  business_type_other: string | null;
  product_interest: string | null;
  status: 'baru' | 'dihubungi' | 'deal' | 'cancel' | 'trial';
  source: string | null;
  created_at: string;
  deleted_at: string | null;
};

type LeadNote = {
  id: string;
  lead_id: string;
  note: string;
  author: 'client' | 'admin';
  created_at: string;
};

type SortKey = 'created_at' | 'name' | 'status';

const STATUS_OPTIONS: Lead['status'][] = ['baru', 'dihubungi', 'deal', 'cancel', 'trial'];

const STATUS_INFO: Record<Lead['status'], { tone: BadgeTone; label: string }> = {
  baru: { tone: 'trial', label: 'Baru' },
  dihubungi: { tone: 'progress', label: 'Dihubungi' },
  deal: { tone: 'active', label: 'Deal' },
  cancel: { tone: 'inactive', label: 'Cancel' },
  trial: { tone: 'progress', label: 'Trial' },
};

const BUSINESS_TYPE_LABEL: Record<string, string> = {
  umkm: 'UMKM', kafe: 'Kafe', restoran: 'Restoran', fnb_lain: 'F&B Lain', lainnya: 'Lainnya',
};

const PRODUCT_INTEREST_LABEL: Record<string, string> = {
  offline: 'Offline', umkm: 'UMKM', fnb: 'F&B', unknown: 'Belum Tahu',
};

function businessTypeLabel(l: Lead) {
  if (!l.business_type) return null;
  if (l.business_type === 'lainnya') return l.business_type_other || 'Lainnya';
  return BUSINESS_TYPE_LABEL[l.business_type] ?? l.business_type;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

function EditModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Lead['status']>(lead.status);
  const [form, setForm] = useState({
    name: lead.name,
    business_name: lead.business_name,
    phone: lead.phone,
    email: lead.email ?? '',
    business_type: lead.business_type ?? '',
    business_type_other: lead.business_type_other ?? '',
    product_interest: lead.product_interest ?? '',
  });
  const [newNote, setNewNote] = useState('');

  const { data: notesData, isLoading: notesLoading } = useQuery<{ data: LeadNote[] }>({
    queryKey: ['lead-notes', lead.id],
    queryFn: () => apiFetch(`/api/v1/admin/leads/${lead.id}/notes`),
  });
  const notes = notesData?.data ?? [];

  const saveMut = useMutation({
    mutationFn: () => apiFetch(`/api/v1/admin/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify({ ...form, status }) }),
    onSuccess: () => {
      toast.success(`${form.name} diperbarui.`);
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const noteMut = useMutation({
    mutationFn: () => apiFetch(`/api/v1/admin/leads/${lead.id}/notes`, { method: 'POST', body: JSON.stringify({ note: newNote }) }),
    onSuccess: () => {
      toast.success('Catatan ditambahkan.');
      setNewNote('');
      qc.invalidateQueries({ queryKey: ['lead-notes', lead.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const dirty = status !== lead.status || Object.entries(form).some(([k, v]) => v !== ((lead as any)[k] ?? ''));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lead.name}</DialogTitle>
          <DialogDescription>{lead.business_name} · {lead.phone}</DialogDescription>
        </DialogHeader>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="lead-name">Nama</Label>
            <Input id="lead-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="lead-business">Usaha</Label>
            <Input id="lead-business" value={form.business_name} onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="lead-phone">Telepon</Label>
            <Input id="lead-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="lead-email">Email</Label>
            <Input id="lead-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="lead-biztype">Jenis Usaha</Label>
            <Input id="lead-biztype" value={form.business_type} onChange={(e) => setForm((f) => ({ ...f, business_type: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="lead-interest">Minat Produk</Label>
            <Input id="lead-interest" value={form.product_interest} onChange={(e) => setForm((f) => ({ ...f, product_interest: e.target.value }))} />
          </div>
        </div>

        <div className="mb-4">
          <Label>Status</Label>
          <div className="grid grid-cols-3 gap-2">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`min-h-[44px] rounded-xl border py-2 text-xs font-display font-semibold transition-colors ${
                  status === s
                    ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-ink)]'
                    : 'border-[var(--border)] text-[var(--muted)]'
                }`}
              >
                {STATUS_INFO[s].label}
              </button>
            ))}
          </div>
          <Button size="sm" className="mt-2 w-full" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !dirty}>
            {saveMut.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
          </Button>
        </div>

        <div className="mb-4">
          <Label>Riwayat Catatan</Label>
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
            {notesLoading ? (
              <p className="text-xs text-[var(--muted)]">Memuat...</p>
            ) : notes.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">Belum ada catatan.</p>
            ) : (
              notes.map((n) => (
                <div key={n.id} className="rounded-lg bg-[var(--surface-2)] p-2 text-xs">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--muted)]">
                    <span>{n.author === 'client' ? 'Klien (form pendaftaran)' : 'Admin'}</span>
                    <span>{formatDateTime(n.created_at)}</span>
                  </div>
                  <p className="text-[var(--ink)]">{n.note}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mb-4">
          <Label htmlFor="lead-new-note">Tambah Catatan</Label>
          <Textarea id="lead-new-note" value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={2} />
          <Button size="sm" className="mt-2 w-full" onClick={() => noteMut.mutate()} disabled={noteMut.isPending || !newNote.trim()}>
            {noteMut.isPending ? 'Menyimpan...' : 'Tambah Catatan'}
          </Button>
        </div>

        <Button variant="outline" onClick={onClose} className="w-full">Tutup</Button>
      </DialogContent>
    </Dialog>
  );
}

function ActionMenu({ lead, isSuperAdmin, onEdit, onRefresh }: {
  lead: Lead; isSuperAdmin: boolean; onEdit: () => void; onRefresh: () => void;
}) {
  const confirmDelete = useConfirmDelete();

  async function act(path: string, method: string, successMsg: string) {
    try {
      await apiFetch(`/api/v1/admin/leads/${lead.id}${path}`, { method });
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
          {!lead.deleted_at && <DropdownMenuItem onClick={onEdit}>Kelola</DropdownMenuItem>}
          <DeleteMenuItems
            state={confirmDelete}
            deleted={!!lead.deleted_at}
            isSuperAdmin={isSuperAdmin}
            onRestore={() => act('/restore', 'POST', `${lead.name} dipulihkan.`)}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteDialogs
        state={confirmDelete}
        name={lead.name}
        hardDeleteWarning="Data dan riwayat catatan hilang selamanya, tidak bisa dipulihkan."
        onDelete={() => act('', 'DELETE', `${lead.name} dihapus. Bisa dipulihkan lewat "Tampilkan yang dihapus".`)}
        onHardDelete={() => act('/hard', 'DELETE', `${lead.name} dihapus permanen.`)}
      />
    </>
  );
}

const PAGE_SIZE = 20;

export default function LeadsPage() {
  const me = useAuthStore((s) => s.user);
  const isSuperAdmin = me?.role === 'super_admin';
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Lead | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [showDeleted, setShowDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'created_at', dir: 'desc' });

  const { data, isLoading } = useQuery<{ data: Lead[]; total: number }>({
    queryKey: ['leads', showDeleted, page],
    queryFn: () => apiFetch(`/api/v1/admin/leads?page=${page}&limit=${PAGE_SIZE}${showDeleted ? '&includeDeleted=1' : ''}`),
  });

  const leads = data?.data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ['leads'] });
  const selection = useSelection(leads);

  const stats = useMemo(
    () => ({
      baru: leads.filter((l) => l.status === 'baru').length,
      dihubungi: leads.filter((l) => l.status === 'dihubungi').length,
      deal: leads.filter((l) => l.status === 'deal').length,
      cancel: leads.filter((l) => l.status === 'cancel').length,
      trial: leads.filter((l) => l.status === 'trial').length,
    }),
    [leads]
  );

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    const rows = !q ? leads : leads.filter(
      (l) => l.name.toLowerCase().includes(q) || l.business_name.toLowerCase().includes(q) || l.phone.includes(q)
    );
    return [...rows].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [leads, debouncedSearch, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  function exportCsv() {
    downloadCsv('leads.csv', filtered.map((l) => ({
      Nama: l.name, Usaha: l.business_name, Telepon: l.phone, Email: l.email ?? '',
      Status: STATUS_INFO[l.status].label, Minat: l.product_interest ?? '', Masuk: l.created_at.slice(0, 10),
    })));
  }

  async function bulkSoftDelete() {
    try {
      const ids = [...selection.selected];
      await apiFetch('/api/v1/admin/leads/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
      toast.success(`${ids.length} lead dihapus. Bisa dipulihkan lewat "Tampilkan yang dihapus".`);
      selection.clear();
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function bulkHardDelete() {
    try {
      const ids = [...selection.selected];
      await apiFetch('/api/v1/admin/leads/bulk-delete/hard', { method: 'POST', body: JSON.stringify({ ids }) });
      toast.success(`${ids.length} lead dihapus permanen.`);
      selection.clear();
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div>
      <h1 className="mb-1 font-display text-xl font-bold text-[var(--ink)]">Leads</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">Calon klien yang masuk lewat form landing page.</p>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Baru" value={stats.baru} tone="trial" />
        <StatCard label="Dihubungi" value={stats.dihubungi} tone="progress" />
        <StatCard label="Trial" value={stats.trial} tone="progress" />
        <StatCard label="Deal" value={stats.deal} tone="active" />
        <StatCard label="Cancel" value={stats.cancel} tone="inactive" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, usaha, atau telepon..." className="pl-9 md:max-w-sm" />
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
        onSoftDelete={bulkSoftDelete}
        onHardDelete={bulkHardDelete}
        onClear={selection.clear}
      />

      {isLoading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-sm text-[var(--muted)]">{leads.length === 0 ? 'Belum ada lead masuk.' : 'Tidak ada lead yang cocok.'}</p>
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
                  <TableHead>Usaha</TableHead>
                  <TableHead>Kontak</TableHead>
                  <TableHead>Jenis Usaha</TableHead>
                  <TableHead>Minat Produk</TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1" onClick={() => toggleSort('status')}>Status <ArrowUpDown className="h-3 w-3" /></button>
                  </TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1" onClick={() => toggleSort('created_at')}>Masuk <ArrowUpDown className="h-3 w-3" /></button>
                  </TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => {
                  const info = STATUS_INFO[l.status];
                  return (
                    <TableRow key={l.id} className={l.deleted_at ? 'opacity-50' : undefined}>
                      <TableCell>
                        <input type="checkbox" checked={selection.selected.has(l.id)} onChange={() => selection.toggle(l.id)} className="h-4 w-4 rounded border-[var(--border)]" />
                      </TableCell>
                      <TableCell className="font-medium text-[var(--ink)]">{l.name}</TableCell>
                      <TableCell className="text-[var(--muted)]">{l.business_name}</TableCell>
                      <TableCell className="text-[var(--muted)]">
                        <div>{l.phone}</div>
                        {l.email && <div className="text-xs text-[var(--muted)]">{l.email}</div>}
                      </TableCell>
                      <TableCell>
                        {businessTypeLabel(l) ? <Badge tone="category">{businessTypeLabel(l)}</Badge> : <span className="text-[var(--muted)]">-</span>}
                      </TableCell>
                      <TableCell>
                        {l.product_interest ? <Badge tone="category">{PRODUCT_INTEREST_LABEL[l.product_interest] ?? l.product_interest}</Badge> : <span className="text-[var(--muted)]">-</span>}
                      </TableCell>
                      <TableCell><Badge tone={info.tone}>{info.label}</Badge></TableCell>
                      <TableCell className="text-[var(--muted)]" title={l.created_at.slice(0, 10)}>{relativeDate(l.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!l.deleted_at && (
                            <Button size="sm" variant="outline" onClick={() => setSelected(l)}>
                              <ClipboardEdit className="h-3.5 w-3.5" /> Kelola
                            </Button>
                          )}
                          <ActionMenu lead={l} isSuperAdmin={isSuperAdmin} onEdit={() => setSelected(l)} onRefresh={refresh} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          <div className="space-y-3 md:hidden">
            {filtered.map((l) => {
              const info = STATUS_INFO[l.status];
              return (
                <Card key={l.id} className={`p-4 ${l.deleted_at ? 'opacity-50' : ''}`}>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked={selection.selected.has(l.id)} onChange={() => selection.toggle(l.id)} className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--border)]" />
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[var(--ink)]">{l.name}</p>
                          <p className="text-xs text-[var(--muted)]">{l.business_name}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge tone={info.tone}>{info.label}</Badge>
                          <ActionMenu lead={l} isSuperAdmin={isSuperAdmin} onEdit={() => setSelected(l)} onRefresh={refresh} />
                        </div>
                      </div>
                      <p className="text-xs text-[var(--muted)]">{l.phone}{l.email ? ` · ${l.email}` : ''}</p>
                      {(businessTypeLabel(l) || l.product_interest) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {businessTypeLabel(l) && <Badge tone="category">{businessTypeLabel(l)}</Badge>}
                          {l.product_interest && <Badge tone="category">{PRODUCT_INTEREST_LABEL[l.product_interest] ?? l.product_interest}</Badge>}
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-[11px] text-[var(--muted)]" title={l.created_at.slice(0, 10)}>Masuk {relativeDate(l.created_at)}</p>
                        {!l.deleted_at && (
                          <Button size="sm" variant="outline" onClick={() => setSelected(l)}>
                            <ClipboardEdit className="h-3.5 w-3.5" /> Kelola
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

      {selected && <EditModal lead={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
