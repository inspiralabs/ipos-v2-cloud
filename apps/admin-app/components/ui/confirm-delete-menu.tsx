'use client';

import { useState } from 'react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from './alert-dialog';
import { DropdownMenuItem, DropdownMenuSeparator } from './dropdown-menu';

/**
 * Radix unmounts DropdownMenuContent's whole subtree when the menu closes (it's a
 * real unmount, not CSS hidden — confirmed by inspecting the DOM). An AlertDialog
 * rendered as a child of DropdownMenuContent gets unmounted along with it before it
 * can ever show, no matter when you flip its `open` state. Fix: keep the confirm
 * dialogs OUTSIDE DropdownMenuContent. This hook holds that state so the two pieces
 * (menu items vs dialogs) can live in different parts of the tree but share state.
 */
export function useConfirmDelete() {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  return { deleteOpen, setDeleteOpen, hardDeleteOpen, setHardDeleteOpen };
}

type ConfirmDeleteState = ReturnType<typeof useConfirmDelete>;

/** Render INSIDE DropdownMenuContent. */
export function DeleteMenuItems({
  state, deleted, isSuperAdmin, onRestore,
}: {
  state: ConfirmDeleteState;
  deleted: boolean;
  isSuperAdmin: boolean;
  onRestore: () => void;
}) {
  return (
    <>
      {deleted ? (
        <DropdownMenuItem onClick={onRestore}>Pulihkan</DropdownMenuItem>
      ) : (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onClick={() => state.setDeleteOpen(true)}>Hapus</DropdownMenuItem>
        </>
      )}
      {isSuperAdmin && <DropdownMenuItem destructive onClick={() => state.setHardDeleteOpen(true)}>Hapus Permanen</DropdownMenuItem>}
    </>
  );
}

/** Render OUTSIDE DropdownMenuContent — as a sibling of <DropdownMenu>. */
export function DeleteDialogs({
  state, name, hardDeleteWarning, onDelete, onHardDelete,
}: {
  state: ConfirmDeleteState;
  name: string;
  hardDeleteWarning?: React.ReactNode;
  onDelete: () => void;
  onHardDelete: () => void;
}) {
  const { deleteOpen, setDeleteOpen, hardDeleteOpen, setHardDeleteOpen } = state;
  return (
    <>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {name}?</AlertDialogTitle>
            <AlertDialogDescription>Hilang dari daftar tapi masih bisa dipulihkan nanti.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onDelete(); setDeleteOpen(false); }}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={hardDeleteOpen} onOpenChange={setHardDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Permanen {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {hardDeleteWarning ?? 'Tindakan ini permanen dan tidak bisa dibatalkan.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onHardDelete(); setHardDeleteOpen(false); }}>Hapus Permanen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
