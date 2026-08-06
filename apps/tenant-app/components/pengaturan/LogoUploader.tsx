'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera } from 'lucide-react';
import { Avatar } from '@/components/Avatar';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;

// Preview instan via URL.createObjectURL, upload sesungguhnya (ke R2) ditangani parent lewat onFileSelected.
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
    e.target.value = '';
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Format harus JPG, PNG, atau WEBP');
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error('Ukuran gambar maksimal 5 MB');
      return;
    }
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
        <p>Klik untuk ganti foto. JPG, PNG, atau WEBP, maks 5 MB.</p>
      </div>
    </div>
  );
}
