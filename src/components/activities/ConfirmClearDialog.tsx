import React from "react";
import { AlertCircle } from "lucide-react";
import { ModalPortal } from "../ModalPortal";

interface Props {
  isOpen: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmClearDialog({ isOpen, message, onCancel, onConfirm }: Props) {
  if (!isOpen) return null;
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[120] grid min-h-dvh place-items-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="activity-clear-title"
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl animate-in zoom-in-95 duration-200"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertCircle size={32} />
          </div>
          <h3 id="activity-clear-title" className="mb-2 text-2xl font-bold text-slate-800">ยืนยันการล้างค่า</h3>
          <p className="mb-6 text-slate-600">{message}</p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-300 px-6 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-lg bg-red-600 px-6 py-2.5 font-medium text-white shadow-md transition-colors hover:bg-red-700"
            >
              ยืนยันการล้างค่า
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
