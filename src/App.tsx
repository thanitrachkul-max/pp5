import React, { lazy, Suspense, useCallback, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AppUser } from './types';
import { supabase, supabaseConfigError } from './lib/supabase';
import {
  resolveAppUser,
  signOut,
  canAccessAdminDashboard,
  canAccessTeacherDashboard,
  isAdmin,
} from './lib/auth';
import { logActivity } from './lib/activityLog';
import { createAuthObserver } from './lib/authObserver';
import type { GradebookSession, TeacherAssignmentView } from './lib/teacherGradebooks';
import {
  CheckCircle2, AlertCircle, Loader2, LogOut,
} from 'lucide-react';
import { clearAdminTabFromUrl, isAdminTabUrl } from './lib/adminNavigation';

type AppView = 'teacher' | 'admin';

const AdminWorkspace = lazy(() =>
  import('./pages/admin/AdminWorkspace').then((module) => ({ default: module.AdminWorkspace })),
);
const TeacherDashboard = lazy(() =>
  import('./pages/teacher/TeacherDashboard').then((module) => ({ default: module.TeacherDashboard })),
);
const GradebookEditor = lazy(() =>
  import('./pages/teacher/GradebookEditor').then((module) => ({ default: module.GradebookEditor })),
);
const Login = lazy(() =>
  import('./components/Login').then((module) => ({ default: module.Login })),
);
const CurriculumPreviewPage = lazy(() =>
  import('./pages/admin/CurriculumPreviewPage').then((module) => ({ default: module.CurriculumPreviewPage })),
);
const Pap5CoverPreviewPage = lazy(() =>
  import('./pages/teacher/Pap5CoverPreviewPage').then((module) => ({ default: module.Pap5CoverPreviewPage })),
);
const Pap5PrintRoutePage = lazy(() =>
  import('./pages/teacher/Pap5PrintRoutePage').then((module) => ({ default: module.Pap5PrintRoutePage })),
);

function readPreviewMode(): string | null {
  return new URLSearchParams(window.location.search).get('preview');
}

function isPap5PrintRoute(): boolean {
  return window.location.pathname.startsWith('/print/pap5/');
}

function shouldOpenAdminFromUrl(): boolean {
  return isAdminTabUrl();
}

function readInitialAppView(): AppView {
  if (readPreviewMode() === 'curriculum') return 'teacher';
  return shouldOpenAdminFromUrl() ? 'admin' : 'teacher';
}

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
}

function SupabaseConfigErrorScreen({ message }: { message: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6 py-10">
      <section className="w-full max-w-xl rounded-2xl border border-red-100 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Supabase ยังไม่ได้ตั้งค่า</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
        <div className="mt-5 rounded-xl bg-slate-50 p-4 text-left text-sm text-slate-700">
          <p className="font-semibold text-slate-900">ต้องเพิ่ม Environment Variables บน Vercel:</p>
          <ul className="mt-2 space-y-1">
            <li><code>VITE_SUPABASE_URL</code></li>
            <li><code>VITE_SUPABASE_ANON_KEY</code></li>
          </ul>
        </div>
      </section>
    </main>
  );
}

function PreviewOnlyApp() {
  const previewMode = readPreviewMode();

  return (
    <Suspense fallback={<RouteFallback />}>
      {previewMode === 'pap5-cover' ? <Pap5CoverPreviewPage /> : <CurriculumPreviewPage />}
    </Suspense>
  );
}

export default function App() {
  const previewMode = readPreviewMode();
  if (isPap5PrintRoute()) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Pap5PrintRoutePage />
      </Suspense>
    );
  }

  if (previewMode === 'curriculum' || previewMode === 'pap5-cover') {
    return <PreviewOnlyApp />;
  }

  if (supabaseConfigError) {
    return <SupabaseConfigErrorScreen message={supabaseConfigError} />;
  }

  return <ConfiguredApp />;
}

function ConfiguredApp() {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeView, setActiveView] = useState<AppView>(readInitialAppView);
  const [gradebookSession, setGradebookSession] = useState<GradebookSession | null>(null);
  const [gradebookReturnView, setGradebookReturnView] = useState<AppView>('teacher');
  const [openingGradebook, setOpeningGradebook] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [teacherReturnPeriodKey, setTeacherReturnPeriodKey] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle');

  const resolvedIdentity = useRef<string | null>(null);
  const applyResolvedUser = useCallback((user: AppUser | null, preferAdminView: boolean) => {
    const activeUser = user?.isActive ? user : null;
    const identity = activeUser ? `${activeUser.id}:${activeUser.role}:${activeUser.schoolId}` : null;
    const sameIdentity = identity !== null && identity === resolvedIdentity.current;
    resolvedIdentity.current = identity;
    setCurrentUser(activeUser);
    if (sameIdentity) return;

    if (!activeUser) {
      setActiveView('teacher');
      setGradebookSession(null);
      setTeacherReturnPeriodKey(null);
      return;
    }

    if (canAccessAdminDashboard(activeUser) && (preferAdminView || shouldOpenAdminFromUrl())) {
      setActiveView('admin');
      return;
    }

    if (!canAccessAdminDashboard(activeUser)) {
      setActiveView('teacher');
    }
  }, []);

  useEffect(() => {
    const observer = createAuthObserver({
      resolve: resolveAppUser,
      apply: (user, event) => {
        setAuthError(null);
        applyResolvedUser(user, event === 'SIGNED_IN' || event === 'INITIAL_SESSION');
        setAuthLoading(false);
        if (event === 'SIGNED_IN' && user?.isActive && canAccessAdminDashboard(user)) {
          const action = user.role === 'executive' ? 'เข้าสู่ระบบ (ผู้บริหาร)' : 'เข้าสู่ระบบ (ผู้ดูแลระบบ)';
          void logActivity(user.schoolId, user.id, user.name, action, user.role).catch(() => undefined);
        }
      },
      fail: () => {
        setAuthError('ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่');
        setAuthLoading(false);
      },
    });
    // INITIAL_SESSION replaces a competing getSession request at startup.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(observer.onChange);
    return () => { observer.dispose(); subscription.unsubscribe(); };
  }, [applyResolvedUser]);

  useEffect(() => {
    if (syncStatus === 'saved') {
      const timer = setTimeout(() => setSyncStatus('idle'), 3000);
      return () => clearTimeout(timer);
    }
  }, [syncStatus]);

  const renderSyncStatus = () => {
    if (authError) return <div role="alert" className="fixed bottom-4 left-4 z-[120] rounded bg-amber-50 border border-amber-300 p-4 text-amber-900">ตรวจสอบสิทธิ์ไม่สำเร็จ ข้อมูลที่กำลังกรอกยังอยู่ กรุณาตรวจสอบการเชื่อมต่อ</div>;
    if (syncStatus === 'idle' || syncStatus === 'saving') return null;

    let content: React.ReactNode = null;
    let bgColor = 'bg-white';
    let textColor = 'text-slate-600';

    switch (syncStatus) {
      case 'loading':
        content = <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> กำลังโหลดข้อมูล...</>;
        bgColor = 'bg-blue-50 border-blue-200';
        textColor = 'text-blue-700';
        break;
      case 'saved':
        content = <><CheckCircle2 className="w-4 h-4 mr-2" /> บันทึกแล้ว</>;
        bgColor = 'bg-green-50 border-green-200';
        textColor = 'text-green-700';
        break;
      case 'error':
        content = <><AlertCircle className="w-4 h-4 mr-2" /> บันทึกล้มเหลว</>;
        bgColor = 'bg-red-50 border-red-200';
        textColor = 'text-red-700';
        break;
      default:
        return null;
    }

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={syncStatus}
          initial={{ opacity: 0, y: -50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.9 }}
          className={`fixed top-5 left-1/2 -translate-x-1/2 flex items-center px-4 py-2 rounded-full shadow-md border ${bgColor} ${textColor} text-sm font-medium z-[100]`}
        >
          {content}
        </motion.div>
      </AnimatePresence>
    );
  };

  const handleLogin = (user: AppUser) => {
    resolvedIdentity.current = `${user.id}:${user.role}:${user.schoolId}`;
    setCurrentUser(user);
    setGradebookSession(null);
    setTeacherReturnPeriodKey(null);
    setActiveView(canAccessAdminDashboard(user) ? 'admin' : 'teacher');
  };

  const handleLogout = () => setShowLogoutConfirm(true);

  const confirmLogout = async () => {
    await signOut();
    setCurrentUser(null);
    setGradebookSession(null);
    setTeacherReturnPeriodKey(null);
    setActiveView('teacher');
    setShowLogoutConfirm(false);
  };

  const openAdminView = () => {
    if (!currentUser || !isAdmin(currentUser)) return;
    setGradebookSession(null);
    setActiveView('admin');
  };

  const [viewedTeacher, setViewedTeacher] = useState<{ id: string; name: string } | null>(null);

  const openTeacherView = (teacher?: { id: string; name: string }) => {
    setViewedTeacher(teacher ?? null);
    setTeacherReturnPeriodKey(null);
    clearAdminTabFromUrl();
    setGradebookSession(null);
    setActiveView('teacher');
  };

  const handleOpenGradebook = async (
    assignment: TeacherAssignmentView,
    gradebookId: string,
    options?: { readOnly?: boolean; returnPeriodKey?: string | null }
  ) => {
    setGradebookReturnView(activeView);
    setOpeningGradebook(true);
    setSyncStatus('loading');
    try {
      const { loadGradebookSession } = await import('./lib/teacherGradebooks');
      const session = await loadGradebookSession(gradebookId, assignment);
      setTeacherReturnPeriodKey(
        options?.returnPeriodKey ?? `${assignment.academic_year_id}:${assignment.semester_number}`,
      );
      setActiveView('teacher');
      setGradebookSession(
        typeof options?.readOnly === 'boolean'
          ? { ...session, readOnly: options.readOnly }
          : session,
      );
    } catch {
      setSyncStatus('error');
    } finally {
      setOpeningGradebook(false);
      setSyncStatus('idle');
    }
  };

  const logoutModal = showLogoutConfirm && (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <LogOut className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">ยืนยันการออกจากระบบ</h3>
        <p className="text-slate-500 mb-6">คุณต้องการออกจากระบบใช่หรือไม่?</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(false)}
            className="flex-1 py-2.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-medium"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => void confirmLogout()}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700"
          >
            ออกจากระบบ
          </button>
        </div>
      </div>
    </div>
  );

  if (authError && !currentUser) {
    return <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 p-6">
      <p role="alert">{authError}</p>
      <button type="button" className="rounded bg-blue-600 px-4 py-2 text-white" onClick={() => window.location.reload()}>ลองใหม่</button>
    </main>;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        <Loader2 className="w-6 h-6 mr-2 animate-spin" />
        กำลังตรวจสอบสิทธิ์...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Login onLogin={handleLogin} isLoading={false} />
      </Suspense>
    );
  }

  if (!canAccessTeacherDashboard(currentUser) && !(activeView === 'admin' && canAccessAdminDashboard(currentUser))) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-slate-50">
        <h2 className="text-xl font-bold text-slate-900 mb-2">บัญชีผู้บริหาร</h2>
        <p className="text-slate-500 mb-6">หน้า Dashboard ผู้บริหารจะพร้อมใช้งานใน Phase 7</p>
        <button
          type="button"
          onClick={() => void confirmLogout()}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700"
        >
          ออกจากระบบ
        </button>
      </div>
    );
  }

  if (openingGradebook) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        <Loader2 className="w-6 h-6 mr-2 animate-spin" />
        กำลังเปิดสมุดบันทึก...
      </div>
    );
  }

  if (activeView === 'admin' && canAccessAdminDashboard(currentUser)) {
    return (
      <>
        {renderSyncStatus()}
        <Suspense fallback={<RouteFallback />}>
          <AdminWorkspace
            currentUser={currentUser}
            onOpenTeacherView={openTeacherView}
            onOpenGradebook={handleOpenGradebook}
            onLogout={handleLogout}
          />
        </Suspense>
        {logoutModal}
      </>
    );
  }

  if (gradebookSession) {
    return (
      <>
        {renderSyncStatus()}
        <Suspense fallback={<RouteFallback />}>
          <GradebookEditor
            key={gradebookSession.id}
            session={gradebookSession}
            currentUser={currentUser}
            onBack={() => {
              setGradebookSession(null);
              setActiveView(gradebookReturnView);
            }}
            onLogout={handleLogout}
            onSettings={openAdminView}
            onSyncStatusChange={setSyncStatus}
          />
        </Suspense>
        {logoutModal}
      </>
    );
  }

  return (
    <>
      {renderSyncStatus()}
      <Suspense fallback={<RouteFallback />}>
        <TeacherDashboard
          currentUser={currentUser}
          viewedTeacher={viewedTeacher}
          initialPeriodKey={teacherReturnPeriodKey}
          onOpenGradebook={handleOpenGradebook}
          onLogout={handleLogout}
          onSettings={openAdminView}
        />
      </Suspense>
      {logoutModal}
    </>
  );
}
