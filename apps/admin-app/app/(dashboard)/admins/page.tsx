'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { UserPlus, MoreVertical, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { relativeDate } from '@/lib/format-date';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Card } from '@/components/ui/card';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';

type Admin = {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'admin_staff';
  is_active: boolean;
  created_at: string;
};

const ROLE_LABEL: Record<Admin['role'], string> = { super_admin: 'Super Admin', admin_staff: 'Staff Admin' };

function CreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [role, setRole] = useState<Admin['role']>('admin_staff');

  const mut = useMutation({
    mutationFn: (fd: FormData) => apiFetch('/api/v1/admin/admins', {
      method: 'POST',
      body: JSON.stringify({ name: fd.get('name'), email: fd.get('email'), password: fd.get('password'), role }),
    }),
    onSuccess: () => {
      toast.success('Admin baru ditambahkan');
      qc.invalidateQueries({ queryKey: ['admins'] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Admin Baru</DialogTitle>
          <DialogDescription>Akun ini bisa masuk ke panel ini juga.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); mut.mutate(new FormData(e.currentTarget)); }}
        >
          <div>
            <Label htmlFor="name">Nama</Label>
            <Input id="name" name="name" required autoFocus />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <PasswordInput id="password" name="password" required minLength={8} placeholder="Minimal 8 karakter" />
          </div>
          <div>
            <Label>Peran</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Admin['role'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin_staff">Staff Admin</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Batal</Button>
            <Button type="submit" disabled={mut.isPending} className="flex-1">{mut.isPending ? 'Menyimpan...' : 'Simpan'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ admin, open, onOpenChange }: { admin: Admin; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (password: string) => apiFetch(`/api/v1/admin/admins/${admin.id}/reset-password`, {
      method: 'PATCH', body: JSON.stringify({ password }),
    }),
    onSuccess: () => { toast.success('Password diperbarui'); qc.invalidateQueries({ queryKey: ['admins'] }); onOpenChange(false); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>{admin.name} ({admin.email})</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); mut.mutate(new FormData(e.currentTarget).get('password') as string); }}
        >
          <div>
            <Label htmlFor="new-password">Password Baru</Label>
            <PasswordInput id="new-password" name="password" required minLength={8} placeholder="Minimal 8 karakter" autoFocus />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Batal</Button>
            <Button type="submit" disabled={mut.isPending} className="flex-1">{mut.isPending ? 'Menyimpan...' : 'Reset'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ActionMenu({ admin, isSelf, onRefresh }: { admin: Admin; isSelf: boolean; onRefresh: () => void }) {
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function toggleActive() {
    try {
      await apiFetch(`/api/v1/admin/admins/${admin.id}/${admin.is_active ? 'deactivate' : 'activate'}`, { method: 'PATCH' });
      toast.success(`${admin.name} ${admin.is_active ? 'dinonaktifkan' : 'diaktifkan'}.`);
      onRefresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function remove() {
    try {
      await apiFetch(`/api/v1/admin/admins/${admin.id}`, { method: 'DELETE' });
      toast.success(`${admin.name} dihapus.`);
      onRefresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleteOpen(false);
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
          <DropdownMenuItem onClick={toggleActive}>{admin.is_active ? 'Nonaktifkan' : 'Aktifkan'}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setResetOpen(true)}>Reset Password</DropdownMenuItem>
          {!isSelf && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onClick={() => setDeleteOpen(true)}>Hapus</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ResetPasswordDialog admin={admin} open={resetOpen} onOpenChange={setResetOpen} />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {admin.name}?</AlertDialogTitle>
            <AlertDialogDescription>Akun ini tidak bisa login lagi. Tindakan ini tidak bisa dibatalkan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function AdminsPage() {
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery<{ data: Admin[] }>({
    queryKey: ['admins'],
    queryFn: () => apiFetch('/api/v1/admin/admins'),
  });
  const admins = data?.data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ['admins'] });

  if (me?.role !== 'super_admin') {
    return (
      <Card className="py-12 text-center">
        <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-[var(--muted)]" aria-hidden />
        <p className="text-sm text-[var(--muted)]">Cuma Super Admin yang bisa kelola akun admin.</p>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 font-display text-xl font-bold text-[var(--ink)]">Kelola Admin</h1>
          <p className="text-sm text-[var(--muted)]">Akun yang bisa masuk ke panel ini.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><UserPlus className="h-4 w-4" /> Admin Baru</Button>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : admins.length === 0 ? (
        <Card className="py-12 text-center"><p className="text-sm text-[var(--muted)]">Belum ada admin.</p></Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Peran</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dibuat</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((a) => {
                  const isSelf = a.id === me?.id;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium text-[var(--ink)]">{a.name}{isSelf && <span className="ml-1.5 text-xs text-[var(--muted)]">(Anda)</span>}</TableCell>
                      <TableCell className="text-[var(--muted)]">{a.email}</TableCell>
                      <TableCell><Badge tone="progress">{ROLE_LABEL[a.role]}</Badge></TableCell>
                      <TableCell><Badge tone={(a.is_active ? 'active' : 'inactive') as BadgeTone}>{a.is_active ? 'Aktif' : 'Nonaktif'}</Badge></TableCell>
                      <TableCell className="text-[var(--muted)]">{a.created_at.slice(0, 10)}</TableCell>
                      <TableCell className="text-right"><ActionMenu admin={a} isSelf={isSelf} onRefresh={refresh} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          <div className="space-y-3 md:hidden">
            {admins.map((a) => {
              const isSelf = a.id === me?.id;
              return (
                <Card key={a.id} className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--ink)]">{a.name}{isSelf && <span className="ml-1.5 text-xs text-[var(--muted)]">(Anda)</span>}</p>
                      <p className="text-xs text-[var(--muted)]">{a.email}</p>
                    </div>
                    <ActionMenu admin={a} isSelf={isSelf} onRefresh={refresh} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge tone="progress">{ROLE_LABEL[a.role]}</Badge>
                    <Badge tone={(a.is_active ? 'active' : 'inactive') as BadgeTone}>{a.is_active ? 'Aktif' : 'Nonaktif'}</Badge>
                  </div>
                  <p className="mt-1.5 text-[11px] text-[var(--muted)]">Dibuat {relativeDate(a.created_at)}</p>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
