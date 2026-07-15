'use client';

import { useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

function NoteForm({ note, onSave, onDone }: { note: string | null; onSave: (n: string) => void; onDone: () => void }) {
  const [draft, setDraft] = useState(note ?? '');
  return (
    <div className="space-y-3">
      <textarea
        autoFocus
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Catatan untuk item ini, mis. tanpa bawang"
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <Button
        className="w-full"
        onClick={() => {
          onSave(draft);
          onDone();
        }}
      >
        Simpan Catatan
      </Button>
    </div>
  );
}

export function ItemNoteEditor({ note, onSave }: { note: string | null; onSave: (n: string) => void }) {
  const [openDesktop, setOpenDesktop] = useState(false);
  const [openMobile, setOpenMobile] = useState(false);

  const triggerButton = (
    <button
      type="button"
      aria-label="Tambah catatan"
      className="flex h-8 items-center gap-1 rounded-full px-2 text-xs text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
    >
      <NotebookPen className="h-3.5 w-3.5" />
      {note ? 'Ubah catatan' : 'Catatan'}
    </button>
  );

  return (
    <>
      {/* Tablet/desktop: Popover, hidden on mobile-portrait */}
      <div className="hidden md:block landscape:block">
        <Popover open={openDesktop} onOpenChange={setOpenDesktop}>
          <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
          <PopoverContent>
            <NoteForm note={note} onSave={onSave} onDone={() => setOpenDesktop(false)} />
          </PopoverContent>
        </Popover>
      </div>
      {/* Mobile-portrait: Sheet */}
      <div className="md:hidden landscape:hidden">
        <Sheet open={openMobile} onOpenChange={setOpenMobile}>
          <SheetTrigger asChild>{triggerButton}</SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Catatan Item</SheetTitle>
            </SheetHeader>
            <NoteForm note={note} onSave={onSave} onDone={() => setOpenMobile(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
