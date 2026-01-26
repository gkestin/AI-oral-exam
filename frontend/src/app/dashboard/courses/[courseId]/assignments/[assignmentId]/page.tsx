/**
 * Assignment Detail Page
 * ======================
 * View assignment details, start sessions, view grades.
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui';
import { formatDate, formatDuration } from '@/lib/utils';
import type { Assignment, SessionSummary, Course } from '@/types';
import { SESSION_MODE_LABELS } from '@/types';

export default function AssignmentDetailPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const assignmentId = params.assignmentId as string;
  const router = useRouter();
  
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingSession, setStartingSession] = useState(false);
  const [isInstructor, setIsInstructor] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, assignmentId]);

  const loadData = async () => {
    try {
      const [assignmentData, sessionsData, courseData] = await Promise.all([
        api.assignments.get(courseId, assignmentId),
        api.sessions.list(courseId, { assignmentId }),
        api.courses.get(courseId),
      ]);
      setAssignment(assignmentData);
      setSessions(sessionsData);
      setCourse(courseData);
      setIsInstructor(courseData.instructorPasscode !== '***');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Failed to load assignment');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStartSession = async () => {
    setStartingSession(true);
    try {
      const session = await api.sessions.create(courseId, { assignmentId });
      router.push(`/dashboard/courses/${courseId}/sessions/${session.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Failed to start session');
      }
      setStartingSession(false);
    }
  };

  const handlePublish = async () => {
    try {
      await api.assignments.publish(courseId, assignmentId);
      loadData();
    } catch (err) {
      console.error('Failed to publish:', err);
    }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="spinner" />
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="bg-red-50 border-red-200">
          <CardContent className="py-6 text-center text-red-600">
            {error || 'Assignment not found'}
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
            href={`/dashboard/courses/${courseId}`} 
            className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1 mb-4"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {course?.name || 'Back to course'}
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{assignment.title}</h1>
            {!assignment.isPublished && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                Draft
              </span>
            )}
          </div>
          <p className="text-slate-600 mt-1">
            {SESSION_MODE_LABELS[assignment.mode]}
            {assignment.dueDate && ` · Due ${formatDate(assignment.dueDate)}`}
          </p>
        </div>
        <div className="flex gap-3">
          {isInstructor && !assignment.isPublished && (
            <Button onClick={handlePublish}>
              Publish
            </Button>
          )}
          {isInstructor && (
            <Link href={`/dashboard/courses/${courseId}/assignments/${assignmentId}/edit`}>
              <Button variant="outline">Edit</Button>
            </Link>
          )}
        </div>
      </div>

      {/* Instructions */}
      {assignment.instructions && (
        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-700 whitespace-pre-wrap">{assignment.instructions}</p>
          </CardContent>
        </Card>
      )}

      {/* Assignment Configuration (Instructor only) */}
      {isInstructor && (
        <Card>
          <CardHeader>
            <CardTitle>Assignment Configuration</CardTitle>
            <CardDescription>Technical settings for this assignment</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="text-sm font-medium text-slate-900 mb-1">Voice Configuration</h4>
                <p className="text-sm text-slate-600">
                  {assignment.voiceConfig?.provider === 'elevenlabs'
                    ? 'ElevenLabs AI Voice'
                    : assignment.voiceConfig?.provider === 'browser_tts'
                    ? 'Browser Text-to-Speech'
                    : 'Default Voice'}
                  {assignment.voiceConfig?.elevenLabs?.llmModel && (
                    <span className="block text-xs text-slate-500 mt-1">
                      Model: {assignment.voiceConfig.elevenLabs.llmModel}
                    </span>
                  )}
                </p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-900 mb-1">Time Limit</h4>
                <p className="text-sm text-slate-600">
                  {assignment.timeLimitMinutes
                    ? `${assignment.timeLimitMinutes} minutes`
                    : 'No time limit'}
                </p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-900 mb-1">Input Mode</h4>
                <p className="text-sm text-slate-600">
                  {assignment.inputMode === 'voice_only' && 'Voice Only'}
                  {assignment.inputMode === 'text_only' && 'Text Only'}
                  {assignment.inputMode === 'voice_and_text' && 'Voice and Text'}
                </p>
              </div>
              {assignment.systemPrompt && (
                <div className="sm:col-span-2">
                  <h4 className="text-sm font-medium text-slate-900 mb-1">Custom System Prompt</h4>
                  <p className="text-sm text-slate-600 bg-slate-50 p-2 rounded text-xs font-mono line-clamp-3">
                    {assignment.systemPrompt}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Start Session (for students) */}
      {!isInstructor && assignment.isPublished && (
        <Card className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
          <CardContent className="py-8 text-center">
            <h2 className="text-xl font-semibold mb-2">Ready to Begin?</h2>
            <p className="text-indigo-100 mb-6">
              {assignment.timeLimitMinutes 
                ? `This session has a ${assignment.timeLimitMinutes} minute time limit.`
                : 'Take your time and answer thoughtfully.'}
            </p>
            <Button
              onClick={handleStartSession}
              disabled={startingSession}
              className="bg-white text-indigo-700 hover:bg-gray-100 font-semibold shadow-lg"
            >
              {startingSession ? (
                <span className="flex items-center gap-2">
                  <div className="spinner w-4 h-4" />
                  Starting...
                </span>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Start Session
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Grading Info */}
      {assignment.grading.enabled && (
        <Card>
          <CardHeader>
            <CardTitle>Grading</CardTitle>
            <CardDescription>This assignment uses AI-powered grading</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isInstructor && (
                <div>
                  <h4 className="text-sm font-medium text-slate-900 mb-2">Grading Models</h4>
                  <div className="flex flex-wrap gap-2">
                    {assignment.grading.models.map((model) => (
                      <span key={model} className="px-2 py-1 bg-slate-100 rounded-full text-xs text-slate-600">
                        {model}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h4 className="text-sm font-medium text-slate-900 mb-2">Rubric</h4>
                <div className="grid gap-2">
                  {assignment.grading.rubric.map((cat, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                      <div>
                        <span className="font-medium text-slate-900">{cat.name}</span>
                        <p className="text-xs text-slate-500">{cat.description}</p>
                      </div>
                      <span className="text-sm text-slate-600">{cat.maxPoints} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sessions List */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          {isInstructor ? 'All Sessions' : 'Your Sessions'}
        </h2>
        
        {sessions.length === 0 ? (
          <Card className="bg-slate-50 border-dashed">
            <CardContent className="py-8 text-center text-slate-600">
              No sessions yet
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <Link
                key={session.id}
                href={`/dashboard/courses/${courseId}/sessions/${session.id}`}
              >
                <Card className="card-hover cursor-pointer">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(session.status)}`}>
                          {session.status.replace('_', ' ')}
                        </span>
                        {isInstructor && (
                          <span className="text-sm text-slate-900">{session.studentName}</span>
                        )}
                        {session.startedAt && (
                          <span className="text-sm text-slate-500">
                            {formatDate(session.startedAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        {session.durationSeconds && (
                          <span className="text-slate-500">
                            {formatDuration(session.durationSeconds)}
                          </span>
                        )}
                        {session.finalScore !== undefined && session.finalScore !== null && (
                          <span className="font-medium text-slate-900">
                            {session.finalScore}%
                          </span>
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
        )}
      </div>
    </div>
  );
}
