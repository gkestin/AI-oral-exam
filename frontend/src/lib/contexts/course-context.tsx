/**
 * Course Context
 * ==============
 * Provides persistent course selection across the application
 */

'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '@/lib/api';
import type { CourseWithRole } from '@/types';

interface CourseContextType {
  selectedCourse: CourseWithRole | null;
  courses: CourseWithRole[];
  loading: boolean;
  selectCourse: (courseId: string) => void;
  refreshCourses: () => Promise<void>;
}

const CourseContext = createContext<CourseContextType | undefined>(undefined);

export function CourseProvider({ children }: { children: ReactNode }) {
  const [selectedCourse, setSelectedCourse] = useState<CourseWithRole | null>(null);
  const [courses, setCourses] = useState<CourseWithRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    try {
      const data = await api.courses.list();
      setCourses(data);

      // Auto-select first course if none selected
      if (!selectedCourse && data.length > 0) {
        // Check localStorage for previously selected course
        const savedCourseId = localStorage.getItem('selectedCourseId');
        const savedCourse = data.find(c => c.course.id === savedCourseId);

        if (savedCourse) {
          setSelectedCourse(savedCourse);
        } else {
          setSelectedCourse(data[0]);
          localStorage.setItem('selectedCourseId', data[0].course.id);
        }
      }
    } catch (err) {
      console.error('Failed to load courses:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectCourse = (courseId: string) => {
    const course = courses.find(c => c.course.id === courseId);
    if (course) {
      setSelectedCourse(course);
      localStorage.setItem('selectedCourseId', courseId);
    }
  };

  const refreshCourses = async () => {
    await loadCourses();
  };

  return (
    <CourseContext.Provider value={{
      selectedCourse,
      courses,
      loading,
      selectCourse,
      refreshCourses,
    }}>
      {children}
    </CourseContext.Provider>
  );
}

export function useCourseContext() {
  const context = useContext(CourseContext);
  if (!context) {
    throw new Error('useCourseContext must be used within CourseProvider');
  }
  return context;
}