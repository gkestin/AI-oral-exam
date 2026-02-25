'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Label, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui';
import { Copy } from 'lucide-react';
import type { Course, UserKeyPolicy } from '@/types';

export default function CourseSettingsPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const router = useRouter();
  
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructorPasscode, setInstructorPasscode] = useState('');
  const [studentPasscode, setStudentPasscode] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [trialPolicy, setTrialPolicy] = useState<UserKeyPolicy | null>(null);
  const [editingInstructorCode, setEditingInstructorCode] = useState(false);
  const [editingStudentCode, setEditingStudentCode] = useState(false);
  const [tempInstructorCode, setTempInstructorCode] = useState('');
  const [tempStudentCode, setTempStudentCode] = useState('');

  useEffect(() => {
    loadCourse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  async function loadCourse() {
    try {
      const data = await api.courses.get(courseId);
      setCourse(data);
      setName(data.name);
      setDescription(data.description || '');
      setInstructorPasscode(data.instructorPasscode || '');
      setStudentPasscode(data.studentPasscode || '');
      const policy = await api.users.getKeyPolicy(courseId);
      setTrialPolicy(policy);
    } catch (err) {
      console.error(err);
      setError('Failed to load course');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await api.courses.update(courseId, {
        name,
        description,
        instructorPasscode,
        studentPasscode,
      });
      setSuccess('Settings saved successfully!');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to save settings');
      }
    } finally {
      setSaving(false);
    }
  }

  function generatePasscode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Course not found</h2>
        <Link href="/dashboard/courses">
          <Button>Back to Courses</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link 
          href={`/dashboard/courses/${courseId}`}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          ← Back to Course
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Course Settings</CardTitle>
          <CardDescription>Manage your course configuration and access codes</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-green-50 text-green-600 p-3 rounded-md text-sm">
                {success}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Course Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-medium mb-4">Course Access Information</h3>
              <p className="text-sm text-gray-600 mb-4">
                Share the Course ID with students to help them find your course, then provide the appropriate passcode for enrollment.
              </p>

              <div className="space-y-4">
                {/* Course ID - Read Only */}
                <div>
                  <Label htmlFor="courseId">Course ID</Label>
                  <div className="flex gap-2">
                    <Input
                      id="courseId"
                      value={courseId}
                      readOnly
                      className="bg-gray-50 font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => copyToClipboard(courseId, 'courseId')}
                      className="min-w-[100px]"
                    >
                      {copiedField === 'courseId' ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Copied
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Copy className="w-4 h-4" />
                          Copy
                        </span>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Unique identifier for this course - students use this to find your course
                  </p>
                </div>

                <div>
                  <Label htmlFor="instructorPasscode">Instructor Passcode</Label>
                  <div className="flex gap-2">
                    {editingInstructorCode ? (
                      <>
                        <Input
                          id="instructorPasscode"
                          value={tempInstructorCode}
                          onChange={(e) => setTempInstructorCode(e.target.value)}
                          placeholder="Enter new code or leave empty"
                          className="font-mono"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setTempInstructorCode(generatePasscode())}
                          className="min-w-[100px]"
                        >
                          Generate
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            setInstructorPasscode(tempInstructorCode);
                            setEditingInstructorCode(false);
                          }}
                          className="min-w-[80px]"
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setTempInstructorCode(instructorPasscode);
                            setEditingInstructorCode(false);
                          }}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Input
                          id="instructorPasscode"
                          value={instructorPasscode || '(not set)'}
                          readOnly
                          className="bg-gray-50 font-mono"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setTempInstructorCode(instructorPasscode);
                            setEditingInstructorCode(true);
                          }}
                          className="min-w-[80px]"
                        >
                          Edit
                        </Button>
                        {instructorPasscode && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => copyToClipboard(instructorPasscode, 'instructorCode')}
                            className="min-w-[100px]"
                          >
                            {copiedField === 'instructorCode' ? (
                              <span className="flex items-center gap-1 text-green-600">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Copied
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <Copy className="w-4 h-4" />
                                Copy
                              </span>
                            )}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Others can use this code to join as an instructor
                  </p>
                </div>

                <div>
                  <Label htmlFor="studentPasscode">Student Passcode</Label>
                  <div className="flex gap-2">
                    {editingStudentCode ? (
                      <>
                        <Input
                          id="studentPasscode"
                          value={tempStudentCode}
                          onChange={(e) => setTempStudentCode(e.target.value)}
                          placeholder="Enter new code or leave empty"
                          className="font-mono"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setTempStudentCode(generatePasscode())}
                          className="min-w-[100px]"
                        >
                          Generate
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            setStudentPasscode(tempStudentCode);
                            setEditingStudentCode(false);
                          }}
                          className="min-w-[80px]"
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setTempStudentCode(studentPasscode);
                            setEditingStudentCode(false);
                          }}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Input
                          id="studentPasscode"
                          value={studentPasscode || '(not set)'}
                          readOnly
                          className="bg-gray-50 font-mono"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setTempStudentCode(studentPasscode);
                            setEditingStudentCode(true);
                          }}
                          className="min-w-[80px]"
                        >
                          Edit
                        </Button>
                        {studentPasscode && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => copyToClipboard(studentPasscode, 'studentCode')}
                            className="min-w-[100px]"
                          >
                            {copiedField === 'studentCode' ? (
                              <span className="flex items-center gap-1 text-green-600">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Copied
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <Copy className="w-4 h-4" />
                                Copy
                              </span>
                            )}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Students can use this code to join the course
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t pt-6 flex justify-between">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {trialPolicy && trialPolicy.trialLimit != null && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Shared Trial Usage</CardTitle>
            <CardDescription>
              Non-Harvard users share a pool of trial conversations per course before they must add personal API keys.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Conversations used</span>
                <span className="font-semibold">{trialPolicy.trialUsed ?? 0} / {trialPolicy.trialLimit}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full ${
                    trialPolicy.trialExhausted ? 'bg-red-500' : 'bg-indigo-500'
                  }`}
                  style={{ width: `${Math.min(((trialPolicy.trialUsed ?? 0) / trialPolicy.trialLimit) * 100, 100)}%` }}
                />
              </div>
              {trialPolicy.trialExhausted && (
                <p className="text-xs text-red-600">
                  Trial quota exhausted. Students without personal API keys will be unable to start new sessions.
                </p>
              )}
              {!trialPolicy.trialExhausted && (
                <p className="text-xs text-slate-500">
                  {trialPolicy.trialRemaining} conversation{trialPolicy.trialRemaining !== 1 ? 's' : ''} remaining.
                  Students with Harvard emails or personal API keys are not affected by this limit.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6 border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">Danger Zone</CardTitle>
          <CardDescription>Irreversible actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Archive this course</p>
              <p className="text-sm text-gray-500">
                Hide this course from all users. Can be restored later.
              </p>
            </div>
            <Button 
              variant="outline" 
              className="border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => alert('Coming soon')}
            >
              Archive Course
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
