/**
 * Shared Types
 * =============
 * TypeScript types that mirror backend Pydantic models.
 * Keep in sync with backend/app/models/
 */

// ==================== ENUMS ====================

export type UserRole = 'admin' | 'instructor' | 'student';

export type SessionStatus = 
  | 'pending' 
  | 'in_progress' 
  | 'completed' 
  | 'grading' 
  | 'graded' 
  | 'error';

export type SessionMode = 
  | 'oral_exam' 
  | 'practice' 
  | 'ai_tutor' 
  | 'mock_interview' 
  | 'socratic' 
  | 'custom';

export type GradingTiming = 'immediate' | 'on_demand' | 'student_triggered';

export type InputMode = 'voice_only' | 'voice_and_text' | 'text_only';

// ==================== USER ====================

export interface User {
  id: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  createdAt: Date;
  lastLogin?: Date;
}

export interface UserPublic {
  id: string;
  displayName: string;
  photoUrl?: string;
}

// ==================== COURSE ====================

export interface CourseDefaults {
  gradingEnabled: boolean;
  gradingTiming: GradingTiming;
  gradingModels: string[];
  defaultMode: SessionMode;
  inputMode: InputMode;
}

export interface Course {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  instructorPasscode: string;
  studentPasscode: string;
  defaults: CourseDefaults;
  isActive: boolean;
  createdAt: Date;
  archivedAt?: Date;
}

export interface CourseCreate {
  name: string;
  description?: string;
  instructorPasscode?: string;
  studentPasscode?: string;
  defaults?: Partial<CourseDefaults>;
}

export interface CourseUpdate {
  name?: string;
  description?: string;
  instructorPasscode?: string;
  studentPasscode?: string;
  defaults?: Partial<CourseDefaults>;
  isActive?: boolean;
}

export interface Enrollment {
  id: string;
  userId: string;
  courseId: string;
  role: UserRole;
  joinedAt: Date;
}

export interface CourseWithRole {
  course: Course;
  role: UserRole;
  enrolledAt: Date;
}

// ==================== ASSIGNMENT ====================

export interface RubricCategory {
  name: string;
  description: string;
  maxPoints: number;
  weight: number;
}

export interface GradingConfig {
  enabled: boolean;
  timing: GradingTiming;
  models: string[];
  rubric: RubricCategory[];
  showLiveFeedback: boolean;
  agreementThreshold: number;
}

export interface KnowledgeBase {
  files: string[];
  text?: string;
  links: string[];
  allowStudentUploads: boolean;
}

export type VoiceProvider = 'browser_tts' | 'elevenlabs' | 'openai_realtime' | 'gemini_live';

export interface VoiceConfig {
  provider: VoiceProvider;

  // Browser TTS settings (current working option)
  // Uses Web Speech API + Gemini for text processing

  // ElevenLabs settings (when provider === 'elevenlabs')
  elevenLabs?: {
    mode: 'dynamic' | 'agent_id'; // Dynamic = create from settings, agent_id = use existing
    agentId?: string; // For pre-created agents
    llmModel?: string; // For dynamic: gpt-4o, claude-3-5-sonnet, etc.
    voiceId?: string; // For dynamic: rachel, adam, etc.
    temperature?: number; // For dynamic
    language?: string; // For dynamic
  };

  // OpenAI Realtime settings (when provider === 'openai_realtime')
  openAI?: {
    model?: string; // gpt-4o-realtime, etc.
    voice?: string; // alloy, echo, etc.
    temperature?: number;
  };

  // Gemini Live settings (when provider === 'gemini_live')
  gemini?: {
    model?: string; // gemini-2.0-flash-exp, etc.
    voice?: string; // Gemini voice options
  };
}

export interface Assignment {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  instructions?: string;
  mode: SessionMode;
  systemPrompt?: string;
  inputMode: InputMode;
  dueDate?: Date;
  timeLimitMinutes?: number;
  grading: GradingConfig;
  knowledgeBase: KnowledgeBase;
  voiceConfig?: VoiceConfig;
  isPublished: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface AssignmentCreate {
  title: string;
  description?: string;
  instructions?: string;
  mode?: SessionMode;
  systemPrompt?: string;
  inputMode?: InputMode;
  dueDate?: Date;
  timeLimitMinutes?: number;
  grading?: Partial<GradingConfig>;
  knowledgeBase?: Partial<KnowledgeBase>;
  voiceConfig?: VoiceConfig;
  isPublished?: boolean;
}

export interface AssignmentUpdate {
  title?: string;
  description?: string;
  instructions?: string;
  mode?: SessionMode;
  systemPrompt?: string;
  inputMode?: InputMode;
  dueDate?: Date | null;
  timeLimitMinutes?: number | null;
  grading?: Partial<GradingConfig>;
  knowledgeBase?: Partial<KnowledgeBase>;
  voiceConfig?: VoiceConfig;
  isPublished?: boolean;
  isActive?: boolean;
}

export interface AssignmentSummary {
  id: string;
  title: string;
  mode: SessionMode;
  dueDate?: Date;
  isPublished: boolean;
  sessionCount: number;
  gradedCount: number;
}

// ==================== SESSION ====================

export interface TranscriptMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  audioUrl?: string;
}

export interface Session {
  id: string;
  assignmentId: string;
  courseId: string;
  studentId: string;
  status: SessionStatus;
  startedAt?: Date;
  endedAt?: Date;
  durationSeconds?: number;
  transcript: TranscriptMessage[];
  attemptNumber: number;
  createdAt: Date;
}

export interface SessionCreate {
  assignmentId: string;
  clientInfo?: Record<string, unknown>;
}

export interface SessionSummary {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  status: SessionStatus;
  startedAt?: Date;
  durationSeconds?: number;
  finalScore?: number;
}

// ==================== GRADING ====================

export interface CategoryScore {
  category: string;
  score: number;
  maxScore: number;
  evidence: string;
  feedback: string;
}

export interface LLMGrade {
  id: string;
  sessionId: string;
  model: string;
  round: number;
  scores: CategoryScore[];
  overallFeedback: string;
  createdAt: Date;
}

export interface FinalGrade {
  id: string;
  sessionId: string;
  scores: CategoryScore[];
  totalScore: number;
  maxPossibleScore: number;
  percentage: number;
  overallFeedback: string;
  strengths: string[];
  areasForImprovement: string[];
  modelsUsed: string[];
  agreementScore: number;
  gradedAt: Date;
}

export interface GradeSummary {
  sessionId: string;
  totalScore: number;
  maxPossibleScore: number;
  percentage: number;
  gradedAt: Date;
  status: 'graded' | 'pending' | 'error';
}

// ==================== API RESPONSES ====================

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiError {
  detail: string;
  code?: string;
}

// ==================== SESSION MODE PRESETS ====================

export const SESSION_MODE_LABELS: Record<SessionMode, string> = {
  oral_exam: 'Oral Exam',
  practice: 'Practice Session',
  ai_tutor: 'AI Tutor',
  mock_interview: 'Mock Interview',
  socratic: 'Socratic Discussion',
  custom: 'Custom',
};

export const SESSION_MODE_DESCRIPTIONS: Record<SessionMode, string> = {
  oral_exam: 'Formal assessment with structured questions and grading',
  practice: 'Low-stakes practice with optional feedback',
  ai_tutor: 'Supportive learning assistant that explains concepts',
  mock_interview: 'Simulated interview with behavioral/technical questions',
  socratic: 'Probing questions that challenge and deepen understanding',
  custom: 'Fully customized configuration',
};

// ==================== GRADING MODELS ====================

export const AVAILABLE_GRADING_MODELS = [
  { id: 'gpt-4.1', name: 'GPT-4.1 (OpenAI)', provider: 'openai' },
  { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5 (Anthropic)', provider: 'anthropic' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Google)', provider: 'google' },
] as const;
