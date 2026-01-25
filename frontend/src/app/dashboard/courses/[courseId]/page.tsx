/**
 * Course Detail Page
 * ==================
 * View course details and assignments.
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import type { Course, AssignmentSummary, Assignment } from '@/types';
import { SESSION_MODE_LABELS } from '@/types';
import { Copy } from 'lucide-react';

export default function CourseDetailPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const [course, setCourse] = useState<Course | null>(null);
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInstructor, setIsInstructor] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  useEffect(() => {
    loadCourseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const loadCourseData = async () => {
    try {
      // First get course data to check if user is instructor
      const courseData = await api.courses.get(courseId);
      const isInstr = courseData.instructorPasscode !== '***';

      // Then fetch assignments with includeUnpublished based on role
      const assignmentsData = await api.assignments.list(courseId, isInstr);

      setCourse(courseData);
      setAssignments(assignmentsData);
      setIsInstructor(isInstr);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Failed to load course');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicateAssignment = async (e: React.MouseEvent, assignmentId: string, originalTitle: string) => {
    e.preventDefault(); // Prevent navigation to assignment page
    e.stopPropagation();

    const newTitle = window.prompt('Enter a name for the duplicated assignment:', `${originalTitle} (Copy)`);

    if (!newTitle) {
      return; // User cancelled
    }

    setDuplicatingId(assignmentId);

    try {
      // Get full assignment details
      const originalAssignment = await api.assignments.get(courseId, assignmentId);

      // Create new assignment as draft with modified title
      const newAssignment = await api.assignments.create(courseId, {
        title: newTitle,
        description: originalAssignment.description,
        instructions: originalAssignment.instructions,
        mode: originalAssignment.mode,
        systemPrompt: originalAssignment.systemPrompt,
        inputMode: originalAssignment.inputMode,
        dueDate: originalAssignment.dueDate,
        timeLimitMinutes: originalAssignment.timeLimitMinutes,
        grading: originalAssignment.grading,
        knowledgeBase: originalAssignment.knowledgeBase,
        isPublished: false // Always create as draft
      });

      // Reload assignments to show the new one
      await loadCourseData();
    } catch (err) {
      console.error('Failed to duplicate assignment:', err);
      alert('Failed to duplicate assignment. Please try again.');
    } finally {
      setDuplicatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="spinner" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="bg-red-50 border-red-200">
          <CardContent className="py-6 text-center text-red-600">
            {error || 'Course not found'}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link 
            href="/dashboard/courses" 
            className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1 mb-4"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            All courses
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{course.name}</h1>
          <p className="text-slate-600 mt-1">{course.description || 'No description'}</p>
        </div>
        {isInstructor && (
          <Link href={`/dashboard/courses/${courseId}/settings`}>
            <Button variant="outline">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </Button>
          </Link>
        )}
      </div>

      {/* Instructor info */}
      {isInstructor && (
        <Card className="bg-indigo-50 border-indigo-200">
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-indigo-600 font-medium">Course ID:</span>{' '}
                <code className="bg-white px-2 py-0.5 rounded text-indigo-900">{courseId}</code>
              </div>
              <div>
                <span className="text-indigo-600 font-medium">Student Passcode:</span>{' '}
                <code className="bg-white px-2 py-0.5 rounded text-indigo-900">{course.studentPasscode}</code>
              </div>
              <div>
                <span className="text-indigo-600 font-medium">Instructor Passcode:</span>{' '}
                <code className="bg-white px-2 py-0.5 rounded text-indigo-900">{course.instructorPasscode}</code>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assignments */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900">Assignments</h2>
          {isInstructor && (
            <Link href={`/dashboard/courses/${courseId}/assignments/new`}>
              <Button>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Assignment
              </Button>
            </Link>
          )}
        </div>

        {assignments.length === 0 ? (
          <Card className="bg-slate-50 border-dashed">
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="font-medium text-slate-900 mb-1">No assignments yet</h3>
              <p className="text-slate-600 mb-4">
                {isInstructor 
                  ? 'Create your first assignment to get started.'
                  : 'Your instructor hasn\'t created any assignments yet.'}
              </p>
              {isInstructor && (
                <Link href={`/dashboard/courses/${courseId}/assignments/new`}>
                  <Button size="sm">Create Assignment</Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="relative">
                <Link
                  href={`/dashboard/courses/${courseId}/assignments/${assignment.id}`}
                >
                  <Card className="card-hover cursor-pointer">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium text-slate-900">{assignment.title}</h3>
                              {!assignment.isPublished && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                                  Draft
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-500">
                              {SESSION_MODE_LABELS[assignment.mode]}
                              {assignment.dueDate && ` · Due ${formatDate(assignment.dueDate)}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <span>{assignment.sessionCount} sessions</span>
                          {isInstructor && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => handleDuplicateAssignment(e, assignment.id, assignment.title)}
                              disabled={duplicatingId === assignment.id}
                              className="ml-2 hover:bg-indigo-100"
                              title="Duplicate Assignment"
                            >
                              {duplicatingId === assignment.id ? (
                                <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Copy className="w-4 h-4 text-indigo-600" />
                              )}
                            </Button>
                          )}
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    </div>
  );
}
