'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;

export function ImageDropzone({
  currentUrl,
  alt,
  onFileSelected,
  uploading,
}: {
  currentUrl: string | null;
  alt: string;
  onFileSelected: (file: File) => void;
  uploading?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function validate(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Format harus JPG, PNG, atau WEBP');
      return false;
    }
    if (file.size > MAX_SIZE) {
      toast.error('Ukuran gambar maksimal 5 MB');
      return false;
    }
    return true;
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !validate(file)) return;
    setPreviewUrl(URL.createObjectURL(file));
    onFileSelected(file);
  }

  const src = previewUrl ?? currentUrl;

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={cn(
          'flex aspect-video w-full max-w-xs flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--muted)] transition-colors hover:border-[var(--primary)] active:scale-[0.99] disabled:opacity-60',
          src && 'border-solid border-[var(--border)] bg-[var(--surface)] p-2'
        )}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="h-full w-full rounded-lg object-contain" />
        ) : (
          <>
            <ImagePlus className="h-6 w-6" />
            <span>{uploading ? 'Mengunggah...' : 'Klik untuk unggah gambar'}</span>
          </>
        )}
      </button>
      <input ref={inputRef} type="file" accept={ALLOWED_TYPES.join(',')} className="hidden" onChange={handleFile} />
      <p className="mt-2 text-xs text-[var(--muted)]">JPG, PNG, atau WEBP. Maksimal 5 MB.</p>
    </div>
  );
}
