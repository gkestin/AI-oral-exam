/**
 * Create Assignment Page
 * ======================
 * Form to create a new assignment.
 */

'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button, Input, Label, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui';
import { SESSION_MODE_LABELS, SESSION_MODE_DESCRIPTIONS, AVAILABLE_GRADING_MODELS } from '@/types';
import type { SessionMode, RubricCategory, VoiceProvider, VoiceConfig } from '@/types';
import { ELEVENLABS_LLM_MODELS, ELEVENLABS_VOICES } from '@/lib/elevenlabs';

const DEFAULT_RUBRIC: RubricCategory[] = [
  { name: 'Content Knowledge', description: 'Demonstrates understanding of core concepts', maxPoints: 5, weight: 1 },
  { name: 'Communication', description: 'Articulates ideas clearly and coherently', maxPoints: 5, weight: 1 },
  { name: 'Critical Thinking', description: 'Shows analysis and reasoning ability', maxPoints: 5, weight: 1 },
  { name: 'Application', description: 'Applies concepts to practical scenarios', maxPoints: 5, weight: 1 },
];

export default function NewAssignmentPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [mode, setMode] = useState<SessionMode>('oral_exam');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [examQuestions, setExamQuestions] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(20);
  const [gradingEnabled, setGradingEnabled] = useState(true);
  const [selectedModels, setSelectedModels] = useState<string[]>(
    AVAILABLE_GRADING_MODELS.map(m => m.id)
  );
  const [rubric, setRubric] = useState<RubricCategory[]>(DEFAULT_RUBRIC);

  // Voice provider state
  const [voiceProvider, setVoiceProvider] = useState<VoiceProvider>('browser_tts');
  const [elevenLabsMode, setElevenLabsMode] = useState<'dynamic' | 'agent_id'>('dynamic');
  const [elevenLabsAgentId, setElevenLabsAgentId] = useState('');
  const [elevenLabsModel, setElevenLabsModel] = useState('gpt-4o');
  const [elevenLabsVoice, setElevenLabsVoice] = useState('21m00Tcm4TlvDq8ikWAM'); // Rachel's voice ID

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Build knowledge base with questions if provided
      const knowledgeBase = examQuestions.trim() ? {
        text: `Exam Questions:\n${examQuestions}`
      } : undefined;

      // Build voice configuration
      let voiceConfig: VoiceConfig | undefined;
      if (voiceProvider !== 'browser_tts') {
        voiceConfig = {
          provider: voiceProvider,
          elevenLabs: voiceProvider === 'elevenlabs' ? {
            mode: elevenLabsMode,
            agentId: elevenLabsMode === 'agent_id' ? elevenLabsAgentId : undefined,
            llmModel: elevenLabsMode === 'dynamic' ? elevenLabsModel : undefined,
            voiceId: elevenLabsMode === 'dynamic' ? elevenLabsVoice : undefined,
            language: 'en',
            temperature: 0.7
          } : undefined
        };
      } else {
        voiceConfig = { provider: 'browser_tts' };
      }

      const assignment = await api.assignments.create(courseId, {
        title,
        description: description || undefined,
        instructions: instructions || undefined,
        mode,
        systemPrompt: systemPrompt || undefined,
        timeLimitMinutes: durationMinutes,
        knowledgeBase,
        voiceConfig,
        grading: {
          enabled: gradingEnabled,
          timing: 'immediate',
          models: selectedModels,
          rubric,
          showLiveFeedback: mode === 'practice',
          agreementThreshold: 0.8,
        },
      });
      router.push(`/dashboard/courses/${courseId}/assignments/${assignment.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create assignment');
    } finally {
      setLoading(false);
    }
  };

  const toggleModel = (modelId: string) => {
    setSelectedModels(prev => 
      prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    );
  };

  const updateRubricItem = (index: number, field: keyof RubricCategory, value: string | number) => {
    setRubric(prev => prev.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const addRubricItem = () => {
    setRubric(prev => [...prev, {
      name: '',
      description: '',
      maxPoints: 5,
      weight: 1,
    }]);
  };

  const removeRubricItem = (index: number) => {
    setRubric(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link 
          href={`/dashboard/courses/${courseId}`} 
          className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1 mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to course
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Create Assignment</h1>
        <p className="text-slate-600">Set up a new oral exam, practice session, or other activity.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Midterm Oral Exam"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                className="flex min-h-[80px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                placeholder="Brief description for students..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instructions">Instructions for Students</Label>
              <textarea
                id="instructions"
                className="flex min-h-[100px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                placeholder="Instructions shown before the session starts..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                disabled={loading}
              />
            </div>
          </CardContent>
        </Card>

        {/* Mode Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Session Mode</CardTitle>
            <CardDescription>Choose the type of interaction</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.entries(SESSION_MODE_LABELS) as [SessionMode, string][]).map(([key, label]) => (
                <label
                  key={key}
                  className={`
                    flex flex-col p-4 rounded-lg border-2 cursor-pointer transition-all
                    ${mode === key 
                      ? 'border-indigo-500 bg-indigo-50' 
                      : 'border-slate-200 hover:border-slate-300'}
                  `}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={key}
                    checked={mode === key}
                    onChange={() => setMode(key)}
                    className="sr-only"
                    disabled={loading}
                  />
                  <span className="font-medium text-slate-900">{label}</span>
                  <span className="text-sm text-slate-500 mt-1">
                    {SESSION_MODE_DESCRIPTIONS[key]}
                  </span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* AI Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>AI Examiner Configuration</CardTitle>
            <CardDescription>Configure how the AI will conduct the examination</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="duration">Time Limit (minutes)</Label>
              <Input
                id="duration"
                type="number"
                min="5"
                max="120"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 20)}
                disabled={loading}
              />
              <p className="text-xs text-slate-500">
                Maximum duration for the exam session
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="systemPrompt">System Prompt (Optional)</Label>
              <textarea
                id="systemPrompt"
                className="flex min-h-[120px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                placeholder="Customize the AI examiner's behavior, personality, and approach..."
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-slate-500">
                Leave blank to use default prompt based on session mode
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="examQuestions">Exam Questions (Optional)</Label>
              <textarea
                id="examQuestions"
                className="flex min-h-[150px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                placeholder="Enter specific questions for the AI to ask, one per line:&#10;&#10;1. Explain the concept of recursion&#10;2. What are the benefits of object-oriented programming?&#10;3. How does a hash table work?"
                value={examQuestions}
                onChange={(e) => setExamQuestions(e.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-slate-500">
                The AI can generate questions dynamically or use these as a guide
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Voice Provider Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Voice Interaction</CardTitle>
            <CardDescription>Configure how students interact with the AI examiner</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label>Voice Provider</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={`
                  flex flex-col p-4 rounded-lg border-2 cursor-pointer transition-all
                  ${voiceProvider === 'browser_tts'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 hover:border-slate-300'}
                `}>
                  <input
                    type="radio"
                    name="voiceProvider"
                    value="browser_tts"
                    checked={voiceProvider === 'browser_tts'}
                    onChange={() => setVoiceProvider('browser_tts')}
                    className="sr-only"
                    disabled={loading}
                  />
                  <span className="font-medium text-slate-900">Browser TTS</span>
                  <span className="text-sm text-slate-500 mt-1">
                    Uses browser speech API with Gemini processing (default)
                  </span>
                </label>

                <label className={`
                  flex flex-col p-4 rounded-lg border-2 cursor-pointer transition-all
                  ${voiceProvider === 'elevenlabs'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 hover:border-slate-300'}
                `}>
                  <input
                    type="radio"
                    name="voiceProvider"
                    value="elevenlabs"
                    checked={voiceProvider === 'elevenlabs'}
                    onChange={() => setVoiceProvider('elevenlabs')}
                    className="sr-only"
                    disabled={loading}
                  />
                  <span className="font-medium text-slate-900">ElevenLabs</span>
                  <span className="text-sm text-slate-500 mt-1">
                    Native voice conversation with advanced AI models
                  </span>
                </label>
              </div>
            </div>

            {/* ElevenLabs Configuration */}
            {voiceProvider === 'elevenlabs' && (
              <div className="space-y-4 p-4 bg-slate-50 rounded-lg">
                <div className="space-y-3">
                  <Label>Configuration Mode</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        value="dynamic"
                        checked={elevenLabsMode === 'dynamic'}
                        onChange={() => setElevenLabsMode('dynamic')}
                        disabled={loading}
                      />
                      <span>Dynamic (Recommended)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        value="agent_id"
                        checked={elevenLabsMode === 'agent_id'}
                        onChange={() => setElevenLabsMode('agent_id')}
                        disabled={loading}
                      />
                      <span>Use Existing Agent ID</span>
                    </label>
                  </div>
                </div>

                {elevenLabsMode === 'dynamic' ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="elevenLabsModel">AI Model</Label>
                      <select
                        id="elevenLabsModel"
                        value={elevenLabsModel}
                        onChange={(e) => setElevenLabsModel(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        disabled={loading}
                      >
                        {ELEVENLABS_LLM_MODELS.map(model => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-500">
                        Choose the AI model for conversation processing
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="elevenLabsVoice">Voice</Label>
                      <select
                        id="elevenLabsVoice"
                        value={elevenLabsVoice}
                        onChange={(e) => setElevenLabsVoice(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        disabled={loading}
                      >
                        {ELEVENLABS_VOICES.map(voice => (
                          <option key={voice.id} value={voice.id}>
                            {voice.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-500">
                        Select the voice for the AI examiner
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="elevenLabsAgentId">Agent ID</Label>
                    <Input
                      id="elevenLabsAgentId"
                      placeholder="Enter your ElevenLabs Agent ID"
                      value={elevenLabsAgentId}
                      onChange={(e) => setElevenLabsAgentId(e.target.value)}
                      disabled={loading}
                    />
                    <p className="text-xs text-slate-500">
                      Use an existing agent from your ElevenLabs account
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Grading Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Grading</CardTitle>
                <CardDescription>Configure AI grading council</CardDescription>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={gradingEnabled}
                  onChange={(e) => setGradingEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  disabled={loading}
                />
                <span className="text-sm font-medium">Enable grading</span>
              </label>
            </div>
          </CardHeader>
          {gradingEnabled && (
            <CardContent className="space-y-6">
              {/* Model selection */}
              <div className="space-y-3">
                <Label>Grading Models</Label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_GRADING_MODELS.map((model) => (
                    <label
                      key={model.id}
                      className={`
                        inline-flex items-center px-3 py-1.5 rounded-full text-sm cursor-pointer transition-all
                        ${selectedModels.includes(model.id)
                          ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}
                      `}
                    >
                      <input
                        type="checkbox"
                        checked={selectedModels.includes(model.id)}
                        onChange={() => toggleModel(model.id)}
                        className="sr-only"
                        disabled={loading}
                      />
                      {model.name}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  Select 2-3 models for best results. Models will independently grade and then deliberate.
                </p>
              </div>

              {/* Rubric */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Rubric Categories</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={addRubricItem}>
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add
                  </Button>
                </div>
                <div className="space-y-3">
                  {rubric.map((item, index) => (
                    <div key={index} className="flex gap-3 items-start p-3 bg-slate-50 rounded-lg">
                      <div className="flex-1 space-y-2">
                        <Input
                          placeholder="Category name"
                          value={item.name}
                          onChange={(e) => updateRubricItem(index, 'name', e.target.value)}
                          disabled={loading}
                        />
                        <Input
                          placeholder="Description"
                          value={item.description}
                          onChange={(e) => updateRubricItem(index, 'description', e.target.value)}
                          disabled={loading}
                        />
                      </div>
                      <div className="w-20">
                        <Input
                          type="number"
                          min="1"
                          max="100"
                          value={item.maxPoints}
                          onChange={(e) => updateRubricItem(index, 'maxPoints', parseInt(e.target.value) || 5)}
                          disabled={loading}
                        />
                        <span className="text-xs text-slate-500">max pts</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRubricItem(index)}
                        className="p-2 text-slate-400 hover:text-red-500"
                        disabled={loading}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Error */}
        {error && (
          <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button type="submit" disabled={loading || !title.trim()}>
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="spinner w-4 h-4" />
                Creating...
              </span>
            ) : (
              'Create Assignment'
            )}
          </Button>
          <Link href={`/dashboard/courses/${courseId}`}>
            <Button type="button" variant="outline" disabled={loading}>
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
