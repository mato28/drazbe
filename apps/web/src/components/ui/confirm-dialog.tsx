'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Modal confirmation built on the native <dialog> element (focus trap, Esc to cancel).
 * Never uses window.confirm.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  pending = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onCancel();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/50"
    >
      <div className="grid gap-4 p-5">
        <h2 id="confirm-dialog-title" className="text-lg font-semibold">
          {title}
        </h2>
        <div className="grid gap-3 text-sm">{children}</div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={onCancel}>
            Prekliči
          </Button>
          <Button disabled={pending || confirmDisabled} onClick={onConfirm} autoFocus>
            {pending ? 'Pošiljanje …' : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
