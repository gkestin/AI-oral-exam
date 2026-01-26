/**
 * Dashboard Home
 * ==============
 * Main dashboard showing assignments and recent activity.
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks';
import { api } from '@/lib/api';
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui';
import { useCourseContext } from '@/lib/contexts/course-context';
import { formatDate } from '@/lib/utils';
import type { AssignmentSummary, SessionSummary } from '@/types';
import { SESSION_MODE_LABELS } from '@/types';

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { selectedCourse, courses, loading: coursesLoading } = useCourseContext();
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [recentSessions, setRecentSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedCourse) {
      loadDashboardData();
    } else if (!coursesLoading && courses.length === 0) {
      setLoading(false);
    }
  }, [selectedCourse, coursesLoading]);

  const loadDashboardData = async () => {
    if (!selectedCourse) return;

    try {
      setLoading(true);
      const [assignmentsData, sessionsData] = await Promise.all([
        api.assignments.list(selectedCourse.course.id),
        api.sessions.list(selectedCourse.course.id),
      ]);

      setAssignments(assignmentsData);
      // Only show the 5 most recent sessions
      setRecentSessions(sessionsData.slice(0, 5));
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'graded': return 'bg-green-100 text-green-700';
      case 'completed': return 'bg-blue-100 text-blue-700';
      case 'in_progress': return 'bg-amber-100 text-amber-700';
      case 'grading': return 'bg-purple-100 text-purple-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          Welcome back, {user?.displayName?.split(' ')[0] || 'there'}!
        </h1>
        <p className="text-slate-600 mt-1">
          {selectedCourse
            ? `You're in ${selectedCourse.course.name} as ${selectedCourse.role}`
            : courses.length > 0
            ? 'Select a course from the sidebar to get started'
            : 'Join or create a course to get started'}
        </p>
      </div>

      {/* No course selected state */}
      {!selectedCourse && courses.length === 0 && !loading && (
        <Card className="bg-slate-50 border-dashed">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="font-medium text-slate-900 mb-1">No courses yet</h3>
            <p className="text-slate-600 mb-4">
              Create a new course or join an existing one to get started.
            </p>
            <div className="flex justify-center gap-3">
              <Link href="/dashboard/courses/new">
                <Button size="sm">Create Course</Button>
              </Link>
              <Link href="/dashboard/courses/join">
                <Button size="sm" variant="outline">Join Course</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick actions for instructors */}
      {selectedCourse && selectedCourse.role !== 'student' && (
        <div className="flex flex-wrap gap-4">
          <Link href={`/dashboard/courses/${selectedCourse.course.id}/assignments/new`}>
            <Button>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Assignment
            </Button>
          </Link>
        </div>
      )}

      {/* Assignments grid */}
      {selectedCourse && (
        <div>
          <h2 className="text-xl font-semibold text-slate-900 mb-4">
            {selectedCourse.role === 'student' ? 'Your Assignments' : 'All Assignments'}
          </h2>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="spinner" />
            </div>
          ) : error ? (
            <Card className="bg-red-50 border-red-200">
              <CardContent className="py-6 text-center text-red-600">
                {error}
              </CardContent>
            </Card>
          ) : assignments.length === 0 ? (
            <Card className="bg-slate-50 border-dashed">
              <CardContent className="py-8 text-center text-slate-600">
                No assignments yet
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {assignments.map((assignment) => (
                <Link key={assignment.id} href={`/dashboard/courses/${selectedCourse.course.id}/assignments/${assignment.id}`}>
                  <Card className="card-hover cursor-pointer h-full">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg">{assignment.title}</CardTitle>
                        {!assignment.isPublished && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                            Draft
                          </span>
                        )}
                      </div>
                      <CardDescription className="text-xs uppercase tracking-wider">
                        {SESSION_MODE_LABELS[assignment.mode]}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        {assignment.dueDate && (
                          <p className="text-slate-500">
                            Due: {formatDate(assignment.dueDate)}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent Sessions */}
      {selectedCourse && recentSessions.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Recent Sessions</h2>
          <div className="space-y-2">
            {recentSessions.map((session) => (
              <Link
                key={session.id}
                href={`/dashboard/sessions/${session.id}`}
              >
                <Card className="card-hover cursor-pointer">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(session.status)}`}>
                          {session.status.replace('_', ' ')}
                        </span>
                        {selectedCourse.role !== 'student' && (
                          <span className="text-sm text-slate-900">{session.studentName}</span>
                        )}
                        {session.startedAt && (
                          <span className="text-sm text-slate-500">
                            {formatDate(session.startedAt)}
                          </span>
                        )}
                      </div>
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
