'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Search, Send, Users, Coins, HelpCircle } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { PlanGate } from '@/components/PlanGate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Member = {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  points_balance: number;
  created_at: string;
};

type Broadcast = {
  id: string;
  segment: 'all' | 'top_member' | 'inactive_30d';
  message: string;
  recipient_count: number;
  sent_by: string;
  created_at: string;
};

const SEGMENT_LABEL: Record<Broadcast['segment'], string> = {
  all: 'Semua Member',
  top_member: 'Top Member',
  inactive_30d: 'Tidak Aktif 30 Hari',
};

function LoyaltyDashboard() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  function reload(q = '') {
    apiFetch(`/api/v1/tenants/loyalty/members${q ? `?search=${encodeURIComponent(q)}` : ''}`)
      .then((res) => setMembers(res.data))
      .catch(() => setFailed(true));
  }

  useEffect(() => { reload(); }, []);

  useEffect(() => {
    const t = setTimeout(() => reload(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  if (failed) return <EmptyState>Gagal memuat data member. Coba muat ulang halaman.</EmptyState>;
  if (!members) return <Skeleton className="h-40 w-full" />;

  const totalMembers = members.length;
  const totalPoints = members.reduce((sum, m) => sum + m.points_balance, 0);
  const top10 = [...members].sort((a, b) => b.points_balance - a.points_balance).slice(0, 10);

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)]">
              <Users className="h-5 w-5 text-[var(--primary)]" />
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Total Member</p>
              <p className="text-lg font-bold tabular-nums text-[var(--ink)]">{totalMembers}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)]">
              <Coins className="h-5 w-5 text-[var(--primary)]" />
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Poin Beredar</p>
              <p className="text-lg font-bold tabular-nums text-[var(--ink)]">{totalPoints.toLocaleString('id-ID')}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)]">
              <HelpCircle className="h-5 w-5 text-[var(--muted)]" />
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Redeemed Bulan Ini</p>
              <p className="text-lg font-bold text-[var(--muted)]" title="Belum tersedia — backend belum punya endpoint agregat redeem per bulan">—</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-[var(--ink)]">Leaderboard Top Member</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 sm:w-64">
            <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
            <Input
              type="search"
              placeholder="Cari nama atau no HP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-auto border-0 px-0 focus-visible:ring-0"
            />
          </div>
          <Button onClick={() => setAddingMember(true)}>+ Tambah Member</Button>
        </div>
      </div>

      {members.length === 0 ? (
        <EmptyState>
          {search ? 'Tidak ada member yang cocok.' : 'Belum ada member. Klik + Tambah Member untuk menambah.'}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>No HP</TableHead>
              <TableHead className="text-right">Poin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top10.map((m, i) => (
              <TableRow key={m.id}>
                <TableCell className="tabular-nums text-[var(--muted)]">{i + 1}</TableCell>
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell>{m.phone}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="primary">{m.points_balance.toLocaleString('id-ID')} poin</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {addingMember && (
        <MemberForm
          onClose={() => setAddingMember(false)}
          onSaved={() => { setAddingMember(false); reload(search); }}
        />
      )}
    </>
  );
}

function MemberForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/v1/tenants/loyalty/members', {
        method: 'POST',
        body: JSON.stringify({ name, phone }),
      });
      toast.success('Member baru ditambahkan');
      onSaved();
    } catch (e: any) {
      setError(e.message);
      toast.error(e.message || 'Gagal menambah member');
      setSaving(false);
    }
  }

  return (
    <Modal title="Tambah Member" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nama">
          <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="No HP" hint="No HP jadi identitas member — tanpa password.">
          <Input required type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Batal</Button>
          <Button type="submit" disabled={saving} className="flex-1">{saving ? 'Menyimpan...' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function BroadcastSection() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[] | null>(null);
  const [segment, setSegment] = useState<Broadcast['segment']>('all');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  function reload() {
    apiFetch('/api/v1/tenants/loyalty/broadcasts')
      .then(setBroadcasts)
      .catch(() => setBroadcasts([]));
  }

  useEffect(() => { reload(); }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const res = await apiFetch('/api/v1/tenants/loyalty/broadcasts', {
        method: 'POST',
        body: JSON.stringify({ segment, message }),
      });
      toast.success(`Pesan terkirim ke ${res.recipient_count ?? 0} penerima`);
      setMessage('');
      reload();
    } catch (e: any) {
      setError(e.message);
      toast.error(e.message || 'Gagal mengirim broadcast');
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Broadcast WhatsApp</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={send} className="space-y-4">
          <Field label="Kirim ke Segment">
            <Select value={segment} onValueChange={(v) => setSegment(v as Broadcast['segment'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Member</SelectItem>
                <SelectItem value="top_member">Top Member</SelectItem>
                <SelectItem value="inactive_30d">Tidak Aktif 30 Hari</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Pesan">
            <textarea
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tulis pesan promo/broadcast..."
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
            />
          </Field>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[var(--muted)]">Broadcast dicatat sistem — pengiriman WA aktual menyusul.</p>
            <Button type="submit" disabled={sending} className="sm:w-auto">
              <Send className="h-4 w-4" /> {sending ? 'Mengirim...' : 'Kirim Broadcast'}
            </Button>
          </div>
        </form>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">Riwayat Broadcast</h3>
          {broadcasts === null ? (
            <Skeleton className="h-24 w-full" />
          ) : broadcasts.length === 0 ? (
            <EmptyState>Belum ada broadcast terkirim.</EmptyState>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {broadcasts.map((b) => (
                <li key={b.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="neutral">{SEGMENT_LABEL[b.segment]}</Badge>
                      <span className="text-xs text-[var(--muted)]">{new Date(b.created_at).toLocaleString('id-ID')}</span>
                    </div>
                    <p className="truncate text-sm text-[var(--ink)]">{b.message}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--ink)]">{b.recipient_count} penerima</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoyaltyPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold text-[var(--ink)]">Loyalty Program</h1>
      <PlanGate featureKey="loyalty_program" featureLabel="Loyalty Program">
        <LoyaltyDashboard />
        <BroadcastSection />
      </PlanGate>
    </div>
  );
}
