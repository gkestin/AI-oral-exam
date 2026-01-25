/**
 * Join Course Page
 * ================
 * Form to join an existing course with passcode.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Label, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui';

export default function JoinCoursePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [courseId, setCourseId] = useState('');
  const [passcode, setPasscode] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await api.courses.enroll(courseId, passcode);
      router.push(`/dashboard/courses/${courseId}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Failed to join course');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link 
          href="/dashboard/courses" 
          className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1 mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to courses
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Join a Course</h1>
        <p className="text-slate-600">Enter the course ID and passcode provided by your instructor.</p>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Course Access</CardTitle>
          <CardDescription>
            The passcode determines your role: student or instructor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="courseId">Course ID *</Label>
              <Input
                id="courseId"
                placeholder="Enter the course ID"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                required
                disabled={loading}
              />
              <p className="text-xs text-slate-500">
                The course ID is provided by your instructor.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="passcode">Passcode *</Label>
              <Input
                id="passcode"
                placeholder="Enter the access passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.toUpperCase())}
                required
                disabled={loading}
              />
              <p className="text-xs text-slate-500">
                Use the student passcode to join as a student, or instructor passcode to join as an instructor.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={loading || !courseId.trim() || !passcode.trim()}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="spinner w-4 h-4" />
                    Joining...
                  </span>
                ) : (
                  'Join Course'
                )}
              </Button>
              <Link href="/dashboard/courses">
                <Button type="button" variant="outline" disabled={loading}>
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
