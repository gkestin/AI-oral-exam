/**
 * Assignments List Page
 * ====================
 * View all assignments for the selected course.
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui';
import { useCourseContext } from '@/lib/contexts/course-context';
import { formatDate } from '@/lib/utils';
import type { Assignment, AssignmentSummary } from '@/types';
import { SESSION_MODE_LABELS } from '@/types';

export default function AssignmentsPage() {
  const { selectedCourse } = useCourseContext();
  const router = useRouter();
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const isInstructor = selectedCourse?.role !== 'student';

  useEffect(() => {
    if (selectedCourse) {
      loadAssignments();
    }
  }, [selectedCourse]);

  const loadAssignments = async () => {
    if (!selectedCourse) return;

    try {
      setLoading(true);
      const data = await api.assignments.list(selectedCourse.course.id);
      setAssignments(data);
    } catch (err) {
      setError('Failed to load assignments');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async (assignment: AssignmentSummary, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!selectedCourse) return;

    try {
      // Get full assignment details first (the list might not have all fields)
      const fullAssignment = await api.assignments.get(selectedCourse.course.id, assignment.id);

      // Process voice configuration for duplication
      let voiceConfig = fullAssignment.voiceConfig;
      if (voiceConfig?.elevenLabs?.agentId) {
        // Clear the agent ID for dynamic mode - a new agent will be created for the duplicated assignment
        voiceConfig = {
          ...voiceConfig,
          elevenLabs: {
            ...voiceConfig.elevenLabs,
            agentId: undefined // Clear agent ID so a new one is created
          }
        };
      }

      const duplicatedAssignment = {
        title: `${fullAssignment.title} (Copy)`,
        description: fullAssignment.description,
        instructions: fullAssignment.instructions,
        mode: fullAssignment.mode,
        systemPrompt: fullAssignment.systemPrompt,
        inputMode: fullAssignment.inputMode,
        voiceConfig: voiceConfig, // Use processed voice config
        timeLimitMinutes: fullAssignment.timeLimitMinutes,
        knowledgeBase: fullAssignment.knowledgeBase,
        grading: fullAssignment.grading,
        dueDate: fullAssignment.dueDate,
        isPublished: false, // Always create as draft
      };

      await api.assignments.create(selectedCourse.course.id, duplicatedAssignment);
      loadAssignments();
    } catch (err) {
      console.error('Failed to duplicate assignment:', err);
    }
  };

  const handleDelete = async (assignmentId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!selectedCourse) return;
    if (!confirm('Are you sure you want to delete this assignment?')) return;

    try {
      await api.assignments.delete(selectedCourse.course.id, assignmentId);
      loadAssignments();
    } catch (err) {
      console.error('Failed to delete assignment:', err);
    }
  };

  if (!selectedCourse) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="py-6 text-center text-amber-600">
            Please select a course from the sidebar to view assignments.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Assignments</h1>
          <p className="text-slate-600 mt-1">
            {selectedCourse.course.name} · {isInstructor ? 'All assignments' : 'Your assignments'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('card')}
              className={`p-1.5 rounded ${viewMode === 'card' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              title="Card view"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              title="List view"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
          </div>

          {isInstructor && (
            <Link href={`/dashboard/courses/${selectedCourse.course.id}/assignments/new`}>
              <Button>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Assignment
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Assignments list */}
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
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="font-medium text-slate-900 mb-1">No assignments yet</h3>
            <p className="text-slate-600 mb-4">
              {isInstructor ? 'Create your first assignment to get started.' : 'No assignments have been created yet.'}
            </p>
            {isInstructor && (
              <Link href={`/dashboard/courses/${selectedCourse.course.id}/assignments/new`}>
                <Button>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Assignment
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'card' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assignments.map((assignment) => (
            <div key={assignment.id} className="relative group">
              <Link href={`/dashboard/courses/${selectedCourse.course.id}/assignments/${assignment.id}`}>
                <Card className="card-hover cursor-pointer h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg">{assignment.title}</CardTitle>
                      <div className="flex items-center gap-2">
                        {!assignment.isPublished && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                            Draft
                          </span>
                        )}
                        {isInstructor && (
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setMenuOpen(menuOpen === assignment.id ? null : assignment.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 rounded transition-opacity"
                            >
                              <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                              </svg>
                            </button>
                            {menuOpen === assignment.id && (
                              <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 z-10">
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    router.push(`/dashboard/courses/${selectedCourse.course.id}/assignments/${assignment.id}/edit`);
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  Edit
                                </button>
                                <button
                                  onClick={(e) => handleDuplicate(assignment, e)}
                                  className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                  Duplicate
                                </button>
                                <button
                                  onClick={(e) => handleDelete(assignment.id, e)}
                                  className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 text-red-600 flex items-center gap-2"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
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
                      {(assignment.sessionCount > 0 || isInstructor || !isInstructor) && (
                        <div className="flex items-center gap-2">
                          {!isInstructor && assignment.sessionCount > 0 ? (
                            <>
                              <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                              </svg>
                              <span className="text-green-600 text-sm">
                                {assignment.sessionCount} {assignment.sessionCount === 1 ? 'attempt' : 'attempts'}
                                {assignment.gradedCount > 0 && ' (graded)'}
                              </span>
                            </>
                          ) : (
                            <p className="text-slate-500 text-sm">
                              {isInstructor ? (
                                <>
                                  {assignment.sessionCount} {assignment.sessionCount === 1 ? 'session' : 'sessions'}
                                  {assignment.gradedCount > 0 && ` (${assignment.gradedCount} graded)`}
                                </>
                              ) : (
                                'Not started'
                              )}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          ))}
        </div>
      ) : (
        // List View
        <div className="space-y-2">
          {assignments.map((assignment) => (
            <div key={assignment.id} className="group">
              <Link href={`/dashboard/courses/${selectedCourse.course.id}/assignments/${assignment.id}`}>
                <Card className="card-hover cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold text-slate-900">{assignment.title}</h3>
                          {!assignment.isPublished && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                              Draft
                            </span>
                          )}
                          <span className="text-xs text-slate-500 uppercase">
                            {SESSION_MODE_LABELS[assignment.mode]}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-600">
                          {assignment.dueDate && (
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {formatDate(assignment.dueDate)}
                            </span>
                          )}
                          {(assignment.sessionCount > 0 || isInstructor) && (
                            <span className="flex items-center gap-1">
                              {!isInstructor && assignment.sessionCount > 0 ? (
                                <>
                                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                  </svg>
                                  <span className="text-green-600">
                                    {assignment.sessionCount} {assignment.sessionCount === 1 ? 'attempt' : 'attempts'}
                                    {assignment.gradedCount > 0 && ' (graded)'}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                  </svg>
                                  {isInstructor ? (
                                    <>
                                      {assignment.sessionCount} {assignment.sessionCount === 1 ? 'session' : 'sessions'}
                                      {assignment.gradedCount > 0 && ` (${assignment.gradedCount} graded)`}
                                    </>
                                  ) : (
                                    'Not started'
                                  )}
                                </>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isInstructor && (
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                router.push(`/dashboard/assignments/${assignment.id}/edit`);
                              }}
                              className="p-1.5 hover:bg-slate-100 rounded"
                              title="Edit"
                            >
                              <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => handleDuplicate(assignment, e)}
                              className="p-1.5 hover:bg-slate-100 rounded"
                              title="Duplicate"
                            >
                              <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => handleDelete(assignment.id, e)}
                              className="p-1.5 hover:bg-slate-100 rounded"
                              title="Delete"
                            >
                              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}