'use client';

import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog';

/** Wrapper tipis di atas Dialog Radix — mempertahankan API `<Modal title onClose>` lama. */
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent wide={wide}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
