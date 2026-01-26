/**
 * Session Page
 * ============
 * Voice/text session interface for exams with Gemini Live integration.
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Button, Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import GeminiVoiceExam from '@/components/GeminiVoiceExam';
import ElevenLabsVoiceExam from '@/components/ElevenLabsVoiceExam';
import { formatDuration } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  FileText,
  BarChart3,
  Mic,
  MessageSquare
} from 'lucide-react';
import type { Session, Assignment, FinalGrade } from '@/types';

export default function SessionPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const sessionId = params.sessionId as string;
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [finalGrade, setFinalGrade] = useState<FinalGrade | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionMode, setSessionMode] = useState<'voice' | 'text'>('voice');

  useEffect(() => {
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, sessionId]);

  useEffect(() => {
    // Poll for updates when status is 'grading'
    if (session?.status === 'grading') {
      const pollInterval = setInterval(() => {
        loadSession();
      }, 3000);

      return () => clearInterval(pollInterval);
    }
  }, [session?.status]);

  const loadSession = async () => {
    try {
      setLoading(true);

      // Load session details
      const sessionData = await api.sessions.get(courseId, sessionId);
      setSession(sessionData);

      // Load assignment details
      const assignmentData = await api.assignments.get(courseId, sessionData.assignmentId);
      setAssignment(assignmentData);

      // Load final grade if session is graded
      if (sessionData.status === 'graded') {
        try {
          const gradeData = await api.grading.getFinalGrade(courseId, sessionId);
          setFinalGrade(gradeData);
        } catch (err) {
          console.error('Failed to load grade:', err);
        }
      }

      setError(null);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  const handleSessionEnd = async (transcript: any[]) => {
    // Save transcript and end session
    try {
      await api.sessions.end(courseId, sessionId);
      await loadSession(); // Reload to get updated status
    } catch (err) {
      console.error('Failed to end session:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !session || !assignment) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="bg-red-50 border-red-200">
          <CardContent className="py-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-red-900">Error Loading Session</h3>
                <p className="text-sm text-red-700 mt-1">
                  {error || 'Session not found'}
                </p>
                <Link
                  href={`/dashboard/courses/${courseId}`}
                  className="text-sm text-red-600 hover:text-red-900 underline mt-2 inline-block"
                >
                  Back to course
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Session not started yet
  if (session.status === 'pending') {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Link
          href={`/dashboard/courses/${courseId}/assignments/${session.assignmentId}`}
          className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to assignment
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{assignment.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-blue-50 rounded-lg p-6">
              <h3 className="font-semibold text-blue-900 mb-3">Before You Begin</h3>
              <ul className="space-y-2 text-sm text-blue-800">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5" />
                  <span>Ensure you're in a quiet environment</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5" />
                  <span>Have your microphone and speakers ready</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5" />
                  <span>Allow microphone permissions when prompted</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5" />
                  <span>Duration: Approximately {assignment.durationMinutes} minutes</span>
                </li>
              </ul>
            </div>

            <div className="flex items-center gap-4">
              <h3 className="font-semibold">Choose Session Mode:</h3>
              <div className="flex gap-2">
                <Button
                  variant={sessionMode === 'voice' ? 'default' : 'outline'}
                  onClick={() => setSessionMode('voice')}
                  className="flex items-center gap-2"
                >
                  <Mic className="w-4 h-4" />
                  Voice
                </Button>
                <Button
                  variant={sessionMode === 'text' ? 'default' : 'outline'}
                  onClick={() => setSessionMode('text')}
                  className="flex items-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  Text
                </Button>
              </div>
            </div>

            {sessionMode === 'voice' ? (
              (() => {
                // Choose voice provider based on assignment configuration
                const voiceProvider = assignment.voiceConfig?.provider || 'browser_tts';

                switch (voiceProvider) {
                  case 'elevenlabs':
                    return (
                      <ElevenLabsVoiceExam
                        sessionId={sessionId}
                        courseId={courseId}
                        assignment={assignment}
                        onSessionEnd={handleSessionEnd}
                      />
                    );
                  case 'browser_tts':
                  case 'gemini_live':
                  default:
                    return (
                      <GeminiVoiceExam
                        sessionId={sessionId}
                        courseId={courseId}
                        assignment={assignment}
                        onSessionEnd={handleSessionEnd}
                      />
                    );
                  // Note: OpenAI Realtime can be added here later
                }
              })()
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p className="text-gray-600">Text mode coming soon</p>
                <p className="text-sm text-gray-500 mt-2">
                  Please use voice mode for now
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Session in progress
  if (session.status === 'in_progress') {
    const voiceProvider = assignment.voiceConfig?.provider || 'browser_tts';

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {voiceProvider === 'elevenlabs' ? (
          <ElevenLabsVoiceExam
            sessionId={sessionId}
            courseId={courseId}
            assignment={assignment}
            onSessionEnd={handleSessionEnd}
          />
        ) : (
          <GeminiVoiceExam
            sessionId={sessionId}
            courseId={courseId}
            assignment={assignment}
            onSessionEnd={handleSessionEnd}
          />
        )}
      </div>
    );
  }

  // Session completed/graded
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link
        href={`/dashboard/courses/${courseId}/assignments/${session.assignmentId}`}
        className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to assignment
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800">
              <CheckCircle className="w-6 h-6" />
              Session Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-gray-600" />
                <div>
                  <p className="text-sm text-gray-600">Duration</p>
                  <p className="font-semibold">{formatDuration(session.durationSeconds)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-gray-600" />
                <div>
                  <p className="text-sm text-gray-600">Messages</p>
                  <p className="font-semibold">{session.transcript?.length || 0}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <BarChart3 className="w-5 h-5 text-gray-600" />
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <p className={`font-semibold ${
                    session.status === 'graded' ? 'text-green-600' :
                    session.status === 'grading' ? 'text-yellow-600' :
                    session.status === 'error' ? 'text-red-600' :
                    'text-blue-600'
                  }`}>
                    {session.status === 'graded' ? 'Graded' :
                     session.status === 'grading' ? 'Grading in Progress...' :
                     session.status === 'error' ? 'Grading Failed' :
                     'Pending Grade'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Grading Status */}
      {session.status === 'grading' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="py-6">
              <div className="flex items-center justify-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-yellow-600" />
                <div>
                  <h4 className="font-medium text-yellow-900">Grading in Progress</h4>
                  <p className="text-sm text-yellow-700 mt-1">
                    Your session is being evaluated by our multi-model grading council...
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Error State */}
      {session.status === 'error' && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="py-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-red-900">Grading Failed</h4>
                <p className="text-sm text-red-700 mt-1">
                  The automatic grading system encountered an error. Please contact your instructor.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Final Grade */}
      {finalGrade && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Your Grade</CardTitle>
                <span className="text-3xl font-bold text-indigo-600">
                  {finalGrade.totalScore.toFixed(1)}/{finalGrade.maxPossibleScore.toFixed(1)}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Category Scores */}
              <div className="space-y-3">
                <h4 className="font-medium text-gray-700">Category Breakdown</h4>
                {finalGrade.scores && finalGrade.scores.map((scoreItem) => (
                  <div key={scoreItem.category} className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm capitalize">{scoreItem.category.replace(/_/g, ' ')}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <motion.div
                          className="bg-indigo-500 h-2 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${(scoreItem.score / scoreItem.maxScore) * 100}%` }}
                          transition={{ duration: 0.5, delay: 0.5 }}
                        />
                      </div>
                      <span className="text-sm font-medium w-12 text-right">
                        {scoreItem.score.toFixed(1)}/{scoreItem.maxScore}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Feedback */}
              {finalGrade.overallFeedback && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">Feedback</h4>
                  <p className="text-sm text-blue-800 whitespace-pre-wrap">
                    {finalGrade.overallFeedback}
                  </p>
                </div>
              )}

              {/* Model Agreement */}
              {finalGrade.agreementScore !== undefined && (
                <div className="text-sm text-gray-600">
                  <span>Model Agreement Score: </span>
                  <span className={`font-medium ${
                    finalGrade.agreementScore > 0.8 ? 'text-green-600' :
                    finalGrade.agreementScore > 0.6 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {(finalGrade.agreementScore * 100).toFixed(0)}%
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Transcript */}
      {session.transcript && session.transcript.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Session Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto space-y-3 p-4 bg-gray-50 rounded-lg">
                {session.transcript.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-2 ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div className={`max-w-[80%] px-4 py-2 rounded-lg text-sm ${
                      msg.role === 'user'
                        ? 'bg-indigo-500 text-white'
                        : 'bg-white border border-gray-200'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}