import React from 'react';

export function WorkspaceTabs({ active, onAdmin, onTeacher }: {
  active: 'admin' | 'teacher'; onAdmin: () => void; onTeacher: () => void;
}) {
  return <nav aria-label="สลับพื้นที่ทำงาน" className="inline-flex shrink-0 items-center rounded-xl border border-slate-200 bg-slate-100 p-1">
    {(['admin', 'teacher'] as const).map(view => <button key={view} type="button"
      aria-current={active === view ? 'page' : undefined} onClick={view === 'admin' ? onAdmin : onTeacher}
      className={`rounded-lg px-3 py-2 text-sm font-bold transition ${active === view ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
      {view === 'admin' ? 'หน้าแอดมิน' : 'หน้ากรอกเกรดครู'}
    </button>)}
  </nav>;
}
