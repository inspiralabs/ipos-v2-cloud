'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/auth';
import { useTenant } from '@/components/layout/TenantContext';
import { LogoUploader } from '@/components/pengaturan/LogoUploader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const NAME_MAX = 30;
const ADDRESS_MAX = 50;

// 0812-3456-7890 — 4 digit awal, lalu kelompok 4 digit dipisah strip, maks 12 digit.
function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 12);
  const parts = [digits.slice(0, 4), digits.slice(4, 8), digits.slice(8, 12)].filter(Boolean);
  return parts.join('-');
}

const PHONE_PATTERN = /^08\d{2}-\d{4}-\d{4}$/;

export default function ProfilPage() {
  const { tenant, refetch } = useTenant();
  const [name, setName] = useState(tenant.name);
  const [address, setAddress] = useState(tenant.address ?? '');
  const [phone, setPhone] = useState(tenant.phone ?? '');
  const [saving, setSaving] = useState(false);

  const phoneValid = phone === '' || PHONE_PATTERN.test(phone);

  async function handleLogoSelected(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    try {
      await apiFetch('/api/v1/tenants/me/logo', { method: 'POST', body: fd });
      await refetch();
      toast.success('Logo toko diperbarui');
    } catch (e: any) {
      toast.error(e.message || 'Gagal upload logo');
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!phoneValid) {
      toast.error('Format No HP belum lengkap, contoh: 0812-3456-7890');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/api/v1/tenants/me', {
        method: 'PATCH',
        body: JSON.stringify({ name, address: address || null, phone: phone || null }),
      });
      await refetch();
      toast.success('Profil toko disimpan');
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Profil Toko</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <LogoUploader currentUrl={tenant.logo_url} storeName={tenant.name} onFileSelected={handleLogoSelected} />
          <form onSubmit={submit} className="space-y-4">
            <Field label="Nama toko">
              <Input
                required
                maxLength={NAME_MAX}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="mt-1 text-right text-xs text-[var(--muted)]">{name.length}/{NAME_MAX}</p>
            </Field>
            <Field label="Alamat" hint="Opsional">
              <Input
                maxLength={ADDRESS_MAX}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Jl. Contoh No. 1"
              />
              <p className="mt-1 text-right text-xs text-[var(--muted)]">{address.length}/{ADDRESS_MAX}</p>
            </Field>
            <Field label="No HP" hint="Opsional">
              <Input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="0812-3456-7890"
                aria-invalid={!phoneValid}
                className={!phoneValid ? 'border-[#b23b2e] focus:border-[#b23b2e] focus:ring-[#b23b2e]/20' : undefined}
              />
              {!phoneValid && <p className="mt-1 text-xs text-[#b23b2e]">Format: 0812-3456-7890</p>}
            </Field>
            <Button type="submit" disabled={saving || !name}>
              {saving ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
