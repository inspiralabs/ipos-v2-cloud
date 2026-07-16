'use client';

import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { Avatar } from '@/components/Avatar';

// ponytail: tidak ada endpoint upload storage di backend (Supabase Storage/S3) saat ini —
// komponen ini hanya menampilkan preview lokal via URL.createObjectURL dan meneruskan
// File terpilih ke onFileSelected. Sambungkan ke endpoint upload nyata begitu tersedia;
// sampai saat itu, parent boleh no-op + toast "belum tersedia".
export function LogoUploader({
  currentUrl,
  storeName,
  onFileSelected,
}: {
  currentUrl: string | null;
  storeName: string;
  onFileSelected: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    onFileSelected(file);
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative flex h-24 w-24 items-center justify-center rounded-full active:scale-95"
        aria-label="Ganti logo toko"
      >
        <Avatar name={storeName} imageUrl={previewUrl ?? currentUrl} size="lg" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition-colors group-hover:bg-black/40">
          <Camera className="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <div className="text-sm text-[var(--muted)]">
        <p className="font-medium text-[var(--ink)]">Logo Toko</p>
        <p>Klik untuk ganti foto. JPG/PNG, maks 2MB.</p>
      </div>
    </div>
  );
}
