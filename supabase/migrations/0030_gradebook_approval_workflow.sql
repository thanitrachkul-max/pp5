-- สถานะอนุมัติ ปพ.5 โดยผู้ดูแลระบบ

alter table public.gradebooks
  add column if not exists approval_status text
    check (approval_status in ('pending', 'approved', 'revision_requested')),
  add column if not exists approval_reason text,
  add column if not exists approval_reason_seen_at timestamptz,
  add column if not exists approval_reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists approval_reviewed_at timestamptz,
  add column if not exists approval_resubmitted_at timestamptz;

comment on column public.gradebooks.approval_status is
  'สถานะอนุมัติ ปพ.5: pending, approved, revision_requested';
comment on column public.gradebooks.approval_reason is
  'เหตุผลที่ผู้ดูแลระบบให้ครูแก้ไข ปพ.5';
comment on column public.gradebooks.approval_reason_seen_at is
  'เวลาที่ครูกดรับทราบเหตุผลการแก้ไข';
