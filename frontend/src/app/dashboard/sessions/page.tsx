/**
 * Sessions List Page
 * ==================
 * View all sessions for the selected course.
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useCourseContext } from '@/lib/contexts/course-context';
import { formatDate, formatDuration } from '@/lib/utils';
import type { SessionSummary, Assignment } from '@/types';

export default function SessionsPage() {
  const { selectedCourse } = useCourseContext();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'grouped'>('grouped');
  const [filterAssignment, setFilterAssignment] = useState<string>('all');
  const isInstructor = selectedCourse?.role !== 'student';

  useEffect(() => {
    if (selectedCourse) {
      loadData();
    }
  }, [selectedCourse]);

  const loadData = async () => {
    if (!selectedCourse) return;

    try {
      setLoading(true);
      const [sessionsData, assignmentsData] = await Promise.all([
        api.sessions.list(selectedCourse.course.id),
        api.assignments.list(selectedCourse.course.id),
      ]);
      setSessions(sessionsData);
      setAssignments(assignmentsData);
    } catch (err) {
      setError('Failed to load sessions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredSessions = () => {
    if (filterAssignment === 'all') {
      return sessions;
    }
    return sessions.filter(s => s.assignmentId === filterAssignment);
  };

  const getGroupedSessions = () => {
    const grouped: Record<string, SessionSummary[]> = {};
    sessions.forEach(session => {
      if (!grouped[session.assignmentId]) {
        grouped[session.assignmentId] = [];
      }
      grouped[session.assignmentId].push(session);
    });
    return grouped;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'graded': return 'bg-green-100 text-green-700';
      case 'completed': return 'bg-blue-100 text-blue-700';
      case 'in_progress': return 'bg-amber-100 text-amber-700';
      case 'grading': return 'bg-purple-100 text-purple-700';
      case 'error': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  if (!selectedCourse) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="py-6 text-center text-amber-600">
            Please select a course from the sidebar to view sessions.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sessions</h1>
          <p className="text-slate-600 mt-1">
            {selectedCourse.course.name} · {isInstructor ? 'All student sessions' : 'Your sessions'}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Filter by assignment */}
            <select
              value={filterAssignment}
              onChange={(e) => setFilterAssignment(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Assignments</option>
              {assignments.map(assignment => (
                <option key={assignment.id} value={assignment.id}>
                  {assignment.title}
                </option>
              ))}
            </select>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('all')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                viewMode === 'all'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Sessions
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                viewMode === 'grouped'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              By Assignment
            </button>
          </div>
        </div>
      </div>

      {/* Sessions list */}
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
      ) : sessions.length === 0 ? (
        <Card className="bg-slate-50 border-dashed">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="font-medium text-slate-900 mb-1">No sessions yet</h3>
            <p className="text-slate-600">
              {isInstructor ? 'Students haven\'t started any sessions yet.' : 'Start an assignment to create your first session.'}
            </p>
          </CardContent>
        </Card>
      ) : viewMode === 'all' ? (
        <div className="space-y-2">
          {getFilteredSessions().map((session) => (
            <Link
              key={session.id}
              href={`/dashboard/courses/${selectedCourse.course.id}/sessions/${session.id}`}
            >
              <Card className="card-hover cursor-pointer">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(session.status)}`}>
                          {session.status.replace('_', ' ')}
                        </span>
                        {isInstructor && (
                          <span className="text-sm text-slate-900 font-medium">{session.studentName}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-slate-500">
                        {session.startedAt && (
                          <span>{formatDate(session.startedAt)}</span>
                        )}
                        {session.durationSeconds && (
                          <span>· {formatDuration(session.durationSeconds)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {session.finalScore !== undefined && session.finalScore !== null && (
                        <div className="text-right">
                          <div className="text-2xl font-bold text-slate-900">
                            {session.finalScore}%
                          </div>
                          <div className="text-xs text-slate-500">Final Score</div>
                        </div>
                      )}
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        // Grouped by assignment view
        <div className="space-y-6">
          {Object.entries(getGroupedSessions()).map(([assignmentId, assignmentSessions]) => {
            const assignment = assignments.find(a => a.id === assignmentId);
            if (filterAssignment !== 'all' && assignmentId !== filterAssignment) {
              return null;
            }

            return (
              <div key={assignmentId}>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">
                  {assignment?.title || 'Unknown Assignment'}
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    ({assignmentSessions.length} session{assignmentSessions.length !== 1 ? 's' : ''})
                  </span>
                </h3>
                <div className="space-y-2">
                  {assignmentSessions.map((session) => (
                    <Link
                      key={session.id}
                      href={`/dashboard/courses/${selectedCourse.course.id}/sessions/${session.id}`}
                    >
                      <Card className="card-hover cursor-pointer">
                        <CardContent className="py-4">
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-3">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(session.status)}`}>
                                  {session.status.replace('_', ' ')}
                                </span>
                                {isInstructor && (
                                  <span className="text-sm text-slate-900 font-medium">{session.studentName}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-sm text-slate-500">
                                {session.startedAt && (
                                  <span>{formatDate(session.startedAt)}</span>
                                )}
                                {session.durationSeconds && (
                                  <span>· {formatDuration(session.durationSeconds)}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              {session.finalScore !== undefined && session.finalScore !== null && (
                                <div className="text-right">
                                  <div className="text-2xl font-bold text-slate-900">
                                    {session.finalScore}%
                                  </div>
                                  <div className="text-xs text-slate-500">Final Score</div>
                                </div>
                              )}
                              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}