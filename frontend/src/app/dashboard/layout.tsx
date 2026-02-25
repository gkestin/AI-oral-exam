/**
 * Dashboard Layout
 * ================
 * Protected layout with navigation.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks';
import { Button } from '@/components/ui';
import { getInitials } from '@/lib/utils';
import { CourseProvider, useCourseContext } from '@/lib/contexts/course-context';
import { api } from '@/lib/api';
import type { UserKeyPolicy } from '@/types';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  requiresCourse?: boolean;
}

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const { selectedCourse, courses, loading: coursesLoading, selectCourse } = useCourseContext();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [keyAttention, setKeyAttention] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.users.getKeyPolicy().then((policy: UserKeyPolicy) => {
      const needsAttention = !policy.hasPersonalKeys && (
        (policy.isHarvardEligible && !policy.emailVerified) ||
        (!policy.isHarvardEligible && !policy.hasPersonalKeys)
      );
      setKeyAttention(needsAttention);
    }).catch(() => {});
  }, [user]);

  // Dynamic navigation items based on selected course
  const navItems: NavItem[] = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      label: 'Assignments',
      href: selectedCourse ? `/dashboard/assignments` : '#',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      requiresCourse: true,
    },
    {
      label: 'Sessions',
      href: selectedCourse ? `/dashboard/sessions` : '#',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      requiresCourse: true,
    },
  ];

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 bottom-0 z-50 w-64 bg-white border-r border-slate-200
        transform transition-transform duration-200 ease-in-out
        lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-2 px-6 h-16 border-b border-slate-200">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">AI</span>
            </div>
            <span className="font-semibold text-slate-800">Oral Exam</span>
          </div>

          {/* Course Selector */}
          {coursesLoading ? (
            <div className="px-4 py-4 border-b border-slate-200">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 block">
                Current Course
              </label>
              <div className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-400 animate-pulse">
                Loading courses...
              </div>
            </div>
          ) : courses.length > 0 ? (
            <div className="px-4 py-4 border-b border-slate-200">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 block">
                Current Course
              </label>
              <select
                value={selectedCourse?.course.id || ''}
                onChange={(e) => selectCourse(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {courses.map(({ course }) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const isLoading = item.requiresCourse && coursesLoading;
              const isDisabled = item.requiresCourse && !coursesLoading && !selectedCourse;
              const isActive = !isDisabled && !isLoading && (pathname === item.href ||
                (item.href !== '/dashboard' && item.href !== '#' && pathname.startsWith(item.href)));

              return (
                <Link
                  key={item.label}
                  href={(isDisabled || isLoading) ? '#' : item.href}
                  className={`
                    flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
                    transition-colors duration-150
                    ${isLoading
                      ? 'text-slate-400 animate-pulse cursor-wait'
                      : isDisabled
                      ? 'text-slate-400 cursor-not-allowed'
                      : isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
                  `}
                  onClick={(e) => {
                    if (isDisabled || isLoading) {
                      e.preventDefault();
                    } else {
                      setSidebarOpen(false);
                    }
                  }}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}

            {/* Course Settings - only for instructors */}
            {selectedCourse?.role !== 'student' && (
              <Link
                key="course-settings"
                href={selectedCourse ? `/dashboard/courses/${selectedCourse.course.id}/settings` : '#'}
                className={`
                  flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
                  transition-colors duration-150
                  ${!selectedCourse
                    ? 'text-slate-400 cursor-not-allowed'
                    : pathname === `/dashboard/courses/${selectedCourse.course.id}/settings`
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
                `}
                onClick={(e) => {
                  if (!selectedCourse) {
                    e.preventDefault();
                  } else {
                    setSidebarOpen(false);
                  }
                }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Course Settings
              </Link>
            )}

            <Link
              href="/dashboard/settings"
              className={`
                flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
                transition-colors duration-150
                ${pathname === '/dashboard/settings'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
              `}
              onClick={() => setSidebarOpen(false)}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              API Keys
              {keyAttention && (
                <span className="ml-auto w-2.5 h-2.5 rounded-full bg-amber-400" />
              )}
            </Link>

            {/* Course Management - always visible */}
            <div className="mt-4 pt-4 border-t border-slate-200">
              <Link
                href="/dashboard/courses/new"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors duration-150"
                onClick={() => setSidebarOpen(false)}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Create Course
              </Link>
              <Link
                href="/dashboard/courses/join"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors duration-150"
                onClick={() => setSidebarOpen(false)}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Join Course
              </Link>
              <Link
                href="/dashboard/courses"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors duration-150"
                onClick={() => setSidebarOpen(false)}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                All Courses
              </Link>
            </div>
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-slate-200">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium">
                {user.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  getInitials(user.displayName || user.email || 'U')
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {user.displayName || 'User'}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {user.email}
                </p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              className="w-full mt-2 justify-start text-slate-600"
              onClick={() => signOut()}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
          <div className="flex items-center gap-4 px-4 sm:px-6 h-16">
            <button
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900"
              onClick={() => setSidebarOpen(true)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex-1" />
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <CourseProvider>
      <DashboardContent>{children}</DashboardContent>
    </CourseProvider>
  );
}
