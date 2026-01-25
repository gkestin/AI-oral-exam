/**
 * API Client
 * ==========
 * Type-safe API client for backend communication.
 */

import { getIdToken } from './firebase';
import type {
  Course, CourseCreate, CourseUpdate, CourseWithRole,
  Assignment, AssignmentCreate, AssignmentUpdate, AssignmentSummary,
  Session, SessionCreate, SessionSummary,
  FinalGrade, LLMGrade, GradeSummary,
  Enrollment,
} from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

// ==================== HTTP CLIENT ====================

class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
    public code?: string,
  ) {
    super(detail);
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getIdToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    // Handle Pydantic validation errors (array of objects) vs simple string detail
    let detail: string;
    if (Array.isArray(error.detail)) {
      // Pydantic validation errors
      detail = error.detail.map((e: { msg?: string; loc?: string[] }) => 
        e.msg || JSON.stringify(e)
      ).join('; ');
    } else if (typeof error.detail === 'object') {
      detail = JSON.stringify(error.detail);
    } else {
      detail = error.detail || 'Unknown error';
    }
    throw new ApiError(response.status, detail, error.code);
  }
  
  // Handle empty responses
  const text = await response.text();
  if (!text) return {} as T;
  
  return JSON.parse(text);
}

// ==================== COURSES ====================

export const courses = {
  list: () => request<CourseWithRole[]>('/courses'),
  
  get: (courseId: string) => request<Course>(`/courses/${courseId}`),
  
  create: (data: CourseCreate) => 
    request<Course>('/courses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  update: (courseId: string, data: CourseUpdate) =>
    request<Course>(`/courses/${courseId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  
  delete: (courseId: string) =>
    request<{ message: string }>(`/courses/${courseId}`, {
      method: 'DELETE',
    }),
  
  enroll: (courseId: string, passcode: string) =>
    request<Enrollment>('/courses/enroll', {
      method: 'POST',
      body: JSON.stringify({ course_id: courseId, passcode }),
    }),
  
  listEnrollments: (courseId: string) =>
    request<Enrollment[]>(`/courses/${courseId}/enrollments`),
};

// ==================== ASSIGNMENTS ====================

export const assignments = {
  list: (courseId: string, includeUnpublished = false) =>
    request<AssignmentSummary[]>(
      `/courses/${courseId}/assignments?include_unpublished=${includeUnpublished}`
    ),
  
  get: (courseId: string, assignmentId: string) =>
    request<Assignment>(`/courses/${courseId}/assignments/${assignmentId}`),
  
  create: (courseId: string, data: AssignmentCreate) =>
    request<Assignment>(`/courses/${courseId}/assignments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  update: (courseId: string, assignmentId: string, data: AssignmentUpdate) =>
    request<Assignment>(`/courses/${courseId}/assignments/${assignmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  
  delete: (courseId: string, assignmentId: string) =>
    request<{ message: string }>(`/courses/${courseId}/assignments/${assignmentId}`, {
      method: 'DELETE',
    }),
  
  publish: (courseId: string, assignmentId: string) =>
    request<{ message: string }>(`/courses/${courseId}/assignments/${assignmentId}/publish`, {
      method: 'POST',
    }),
  
  unpublish: (courseId: string, assignmentId: string) =>
    request<{ message: string }>(`/courses/${courseId}/assignments/${assignmentId}/unpublish`, {
      method: 'POST',
    }),
};

// ==================== SESSIONS ====================

export const sessions = {
  list: (courseId: string, params?: { assignmentId?: string; studentId?: string }) => {
    const query = new URLSearchParams();
    if (params?.assignmentId) query.set('assignment_id', params.assignmentId);
    if (params?.studentId) query.set('student_id', params.studentId);
    const queryStr = query.toString();
    return request<SessionSummary[]>(
      `/courses/${courseId}/sessions${queryStr ? `?${queryStr}` : ''}`
    );
  },
  
  get: (courseId: string, sessionId: string) =>
    request<Session>(`/courses/${courseId}/sessions/${sessionId}`),
  
  create: (courseId: string, data: SessionCreate) =>
    request<Session>(`/courses/${courseId}/sessions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  start: (courseId: string, sessionId: string) =>
    request<{ message: string; started_at: string }>(
      `/courses/${courseId}/sessions/${sessionId}/start`,
      { method: 'POST' }
    ),
  
  addMessage: (
    courseId: string, 
    sessionId: string, 
    message: { role: string; content: string }
  ) =>
    request<{ message: string }>(`/courses/${courseId}/sessions/${sessionId}/message`, {
      method: 'POST',
      body: JSON.stringify({ ...message, timestamp: new Date().toISOString() }),
    }),
  
  end: (courseId: string, sessionId: string) =>
    request<{ message: string; ended_at: string; duration_seconds: number }>(
      `/courses/${courseId}/sessions/${sessionId}/end`,
      { method: 'POST' }
    ),
  
  getTranscript: (courseId: string, sessionId: string) =>
    request<{ transcript: Array<{ role: string; content: string; timestamp: string }> }>(
      `/courses/${courseId}/sessions/${sessionId}/transcript`
    ),
};

// ==================== GRADING ====================

export const grading = {
  trigger: (courseId: string, sessionId: string, forceRegrade = false) =>
    request<{ message: string; session_id: string }>(
      `/courses/${courseId}/grading/grade`,
      {
        method: 'POST',
        body: JSON.stringify({ session_id: sessionId, force_regrade: forceRegrade }),
      }
    ),
  
  getGrades: (courseId: string, sessionId: string) =>
    request<LLMGrade[]>(`/courses/${courseId}/grading/sessions/${sessionId}/grades`),
  
  getFinalGrade: (courseId: string, sessionId: string) =>
    request<FinalGrade>(`/courses/${courseId}/grading/sessions/${sessionId}/final`),
  
  getAssignmentSummary: (courseId: string, assignmentId: string) =>
    request<{
      assignment_id: string;
      total_sessions: number;
      graded: number;
      pending_grading: number;
      in_progress: number;
      errors: number;
      completion_rate: number;
    }>(`/courses/${courseId}/grading/assignment/${assignmentId}/summary`),
  
  gradeAll: (courseId: string, assignmentId: string) =>
    request<{ message: string; session_count: number }>(
      `/courses/${courseId}/grading/assignment/${assignmentId}/grade-all`,
      { method: 'POST' }
    ),
};

// ==================== EXPORT ====================

export const api = {
  courses,
  assignments,
  sessions,
  grading,
};

export { ApiError };
