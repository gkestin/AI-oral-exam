'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Label, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui';
import type { Course } from '@/types';

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
              <h3 className="text-lg font-medium mb-4">Access Codes</h3>
              <p className="text-sm text-gray-600 mb-4">
                Share these codes with instructors and students to let them join your course.
              </p>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="instructorPasscode">Instructor Passcode</Label>
                  <div className="flex gap-2">
                    <Input
                      id="instructorPasscode"
                      value={instructorPasscode}
                      onChange={(e) => setInstructorPasscode(e.target.value)}
                      placeholder="Leave empty to disable"
                    />
                    <Button 
                      type="button" 
                      variant="outline"
                      onClick={() => setInstructorPasscode(generatePasscode())}
                    >
                      Generate
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Others can use this code to join as an instructor
                  </p>
                </div>

                <div>
                  <Label htmlFor="studentPasscode">Student Passcode</Label>
                  <div className="flex gap-2">
                    <Input
                      id="studentPasscode"
                      value={studentPasscode}
                      onChange={(e) => setStudentPasscode(e.target.value)}
                      placeholder="Leave empty to disable"
                    />
                    <Button 
                      type="button" 
                      variant="outline"
                      onClick={() => setStudentPasscode(generatePasscode())}
                    >
                      Generate
                    </Button>
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
