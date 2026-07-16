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

export default function ProfilPage() {
  const { tenant, refetch } = useTenant();
  const [name, setName] = useState(tenant.name);
  const [address, setAddress] = useState(tenant.address ?? '');
  const [phone, setPhone] = useState(tenant.phone ?? '');
  const [saving, setSaving] = useState(false);

  function handleLogoSelected(file: File) {
    // Endpoint upload logo belum ada di backend — beri tahu owner tanpa gagal diam-diam.
    toast.info('Upload logo akan tersedia setelah fitur penyimpanan file selesai dibangun.');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
              <Input required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Alamat" hint="Opsional">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Jl. Contoh No. 1" />
            </Field>
            <Field label="No HP" hint="Opsional">
              <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xxxxxxxxxx" />
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
