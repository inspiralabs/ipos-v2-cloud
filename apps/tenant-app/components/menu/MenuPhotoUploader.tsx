'use client';

import { useRef, useState } from 'react';
import { Camera, UtensilsCrossed } from 'lucide-react';

// Preview instan via URL.createObjectURL, upload sesungguhnya (ke R2) ditangani parent lewat onFileSelected.
export function MenuPhotoUploader({
  currentUrl,
  onFileSelected,
}: {
  currentUrl: string | null;
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

  const shownUrl = previewUrl ?? currentUrl;

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className="group relative flex h-28 w-full items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-2)] active:scale-[0.98]"
      aria-label="Ganti foto menu"
    >
      {shownUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shownUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <UtensilsCrossed className="h-8 w-8 text-[var(--muted)]" />
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
        <Camera className="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </button>
  );
}
