'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useConversation } from '@elevenlabs/react';
import { Mic, MicOff, Volume2, VolumeX, Bot, User, Loader2, Play, StopCircle, AlertCircle, CheckCircle, Phone, PhoneOff } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { api } from '@/lib/api';
import type { Assignment, Session } from '@/types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ElevenLabsVoiceExamProps {
  sessionId: string;
  courseId: string;
  assignment: Assignment;
  onSessionEnd?: (transcript: Message[]) => void;
  onSessionStart?: () => void;
}

export default function ElevenLabsVoiceExam({
  sessionId,
  courseId,
  assignment,
  onSessionEnd,
  onSessionStart
}: ElevenLabsVoiceExamProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);

  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<Date | null>(null);

  // Initialize ElevenLabs conversation
  const conversation = useConversation({
    onConnect: ({ conversationId }) => {
      console.log('Connected to ElevenLabs conversation:', conversationId);
      setIsConnecting(false);
      setError(null);
    },
    onDisconnect: () => {
      console.log('Disconnected from ElevenLabs conversation');
      if (!sessionEnded) {
        setError('Connection lost. Please refresh and try again.');
      }
    },
    onMessage: ({ message, source }) => {
      console.log('Message received:', message, 'from:', source);

      // Extract content from message object - it might be a string or an object
      let content = '';
      if (typeof message === 'string') {
        content = message;
      } else if (message?.text) {
        content = message.text;
      } else if (message?.content) {
        content = message.content;
      } else {
        // Log the entire message object to understand its structure
        console.log('Unknown message structure:', JSON.stringify(message));
        content = JSON.stringify(message);
      }

      // Only add non-empty messages
      if (content && content.trim()) {
        // Add message to transcript
        const newMessage: Message = {
          role: source === 'user' ? 'user' : 'assistant',
          content: content,
          timestamp: new Date()
        };

        setMessages(prev => [...prev, newMessage]);

        // Save to backend
        saveMessageToBackend(newMessage);
      }
    },
    onError: (error) => {
      console.error('ElevenLabs error:', error);
      setError(`Voice connection error: ${error.message || 'Unknown error'}`);
      setIsConnecting(false);
    },
    onModeChange: ({ mode }) => {
      console.log('Conversation mode changed:', mode);
    },
    onStatusChange: ({ status }) => {
      console.log('Connection status:', status);
    }
  });

  // Track if we're already creating an agent to prevent duplicates
  const creatingAgentRef = useRef(false);

  // Get or create agent ID from assignment configuration
  useEffect(() => {
    const setupAgent = async () => {
      // Check if ElevenLabs is configured
      const elevenLabsConfig = assignment.voiceConfig?.elevenLabs;

      if (!elevenLabsConfig) {
        setError('ElevenLabs not configured for this assignment. Please contact your instructor.');
        return;
      }

      // Check if we already have an agent ID (from any mode)
      if (elevenLabsConfig.agentId) {
        // Use the existing agent ID (works for both 'agent_id' and 'dynamic' modes)
        console.log('Using existing ElevenLabs agent:', elevenLabsConfig.agentId);
        setAgentId(elevenLabsConfig.agentId);
      } else if (elevenLabsConfig.mode === 'dynamic') {
        // Prevent duplicate agent creation in React StrictMode
        if (creatingAgentRef.current) {
          console.log('Agent creation already in progress, skipping duplicate request');
          return;
        }
        creatingAgentRef.current = true;

        // First student to access will create the agent
        // We should save this back to the assignment to reuse for other students
        try {
          const { createDynamicAgent } = await import('@/lib/elevenlabs');
          const apiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;

          if (!apiKey) {
            setError('ElevenLabs API key not configured');
            creatingAgentRef.current = false;
            return;
          }

          console.log('Creating dynamic agent for assignment (first time):', assignment.title);
          const newAgentId = await createDynamicAgent(assignment, apiKey);
          console.log('Successfully created agent:', newAgentId);
          setAgentId(newAgentId);

          // Update the assignment to save this agent ID for future students
          // This prevents creating duplicate agents
          try {
            const updatedVoiceConfig = {
              ...assignment.voiceConfig,
              elevenLabs: {
                ...assignment.voiceConfig?.elevenLabs,
                agentId: newAgentId
              }
            };

            await api.assignments.update(courseId, assignment.id, {
              voiceConfig: updatedVoiceConfig
            });
            console.log('Saved agent ID to assignment for reuse');
          } catch (updateErr) {
            console.error('Failed to save agent ID to assignment:', updateErr);
            // Continue anyway - the agent was created successfully
          }
        } catch (err: any) {
          console.error('Failed to create dynamic agent:', err);
          setError(`Failed to create voice agent: ${err.message || 'Unknown error'}`);
          creatingAgentRef.current = false;
        }

        // Reset flag after successful creation
        creatingAgentRef.current = false;
      } else {
        setError('Invalid ElevenLabs configuration - please configure an agent');
      }
    };

    setupAgent();
  }, [assignment]);

  // Timer for session duration
  useEffect(() => {
    if (sessionStarted && !sessionEnded && assignment.timeLimitMinutes) {
      const totalSeconds = assignment.timeLimitMinutes * 60;
      setTimeRemaining(totalSeconds);

      sessionTimerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev === null || prev <= 1) {
            handleEndSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (sessionTimerRef.current) {
          clearInterval(sessionTimerRef.current);
        }
      };
    }
  }, [sessionStarted, sessionEnded]);

  const saveMessageToBackend = async (message: Message) => {
    try {
      await api.sessions.addMessage(courseId, sessionId, {
        role: message.role,
        content: message.content
      });
    } catch (err) {
      console.error('Failed to save message to backend:', err);
    }
  };

  const handleStartSession = async () => {
    if (!agentId) {
      setError('Agent ID not configured');
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);

      // Start session in backend
      await api.sessions.start(courseId, sessionId);

      setSessionStarted(true);
      startTimeRef.current = new Date();

      if (onSessionStart) {
        onSessionStart();
      }

      // Start ElevenLabs conversation
      // For public agents (no auth required)
      await conversation.startSession({
        agentId: agentId,
        connectionType: 'webrtc' // Use WebRTC for better real-time performance
      });

      // Don't manually add a greeting - let the agent's first_message be captured by onMessage
      // This prevents duplicate or cut-off messages
      setMessages([]);

    } catch (err: any) {
      console.error('Failed to start session:', err);
      setError(`Failed to start session: ${err.message || 'Unknown error'}`);
      setIsConnecting(false);
      setSessionStarted(false);
    }
  };

  const handleEndSession = async () => {
    setSessionEnded(true);

    // End ElevenLabs conversation
    if (conversation.status === 'connected') {
      await conversation.endSession();
    }

    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
    }

    // Save transcript and end session
    try {
      await api.sessions.end(courseId, sessionId);

      if (onSessionEnd) {
        onSessionEnd(messages);
      }
    } catch (err) {
      console.error('Failed to end session:', err);
    }
  };

  const buildSystemPrompt = () => {
    let prompt = assignment.systemPrompt || `You are an AI examiner conducting an oral examination.
Be professional but friendly. Ask follow-up questions to assess understanding.
Keep responses concise for natural conversation.`;

    prompt += `\n\nExam Title: ${assignment.title}`;

    if (assignment.description) {
      prompt += `\nExam Description: ${assignment.description}`;
    }

    if (assignment.knowledgeBase?.text) {
      prompt += `\n\n${assignment.knowledgeBase.text}`;
    }

    if (assignment.grading?.enabled && assignment.grading.rubric.length > 0) {
      prompt += `\n\nGrading Criteria:`;
      assignment.grading.rubric.forEach(criteria => {
        prompt += `\n- ${criteria.name}: ${criteria.description}`;
      });
    }

    if (assignment.mode === 'practice') {
      prompt += `\n\nThis is a practice session. Be helpful and provide hints when needed.`;
    } else if (assignment.mode === 'interview') {
      prompt += `\n\nThis is an interview. Focus on assessing relevant skills and experience.`;
    }

    return prompt;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardContent className="p-6">
          <div className="mb-4">
            <h2 className="text-2xl font-bold mb-2">{assignment.title}</h2>
            <p className="text-sm text-gray-600">
              {assignment.description || 'AI-powered oral examination with ElevenLabs'}
            </p>
            <div className="mt-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block">
              Powered by ElevenLabs Conversational AI
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Connection Status */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                conversation.status === 'connected' ? 'bg-green-500' :
                isConnecting ? 'bg-yellow-500 animate-pulse' :
                'bg-gray-400'
              }`} />
              <span className="text-sm text-gray-600">
                {conversation.status === 'connected' ? 'Connected to AI' :
                 isConnecting ? 'Connecting...' :
                 'Not connected'}
              </span>
            </div>
            {timeRemaining !== null && (
              <div className="text-sm font-medium text-gray-700">
                Time remaining: {formatTime(timeRemaining)}
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="h-96 overflow-y-auto mb-6 space-y-4 p-4 bg-gray-50 rounded-lg">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex gap-3 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    msg.role === 'user' ? 'bg-blue-500' : 'bg-purple-500'
                  }`}>
                    {msg.role === 'user' ?
                      <User className="w-4 h-4 text-white" /> :
                      <Bot className="w-4 h-4 text-white" />
                    }
                  </div>
                  <div className={`px-4 py-2 rounded-lg ${
                    msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white border'
                  }`}>
                    <p>{msg.content}</p>
                    <p className={`text-xs mt-1 ${
                      msg.role === 'user' ? 'text-blue-200' : 'text-gray-500'
                    }`}>
                      {msg.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {/* Connection indicator */}
            {isConnecting && (
              <div className="flex justify-center">
                <div className="bg-gray-100 px-4 py-2 rounded-lg flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-gray-600">Connecting to AI...</span>
                </div>
              </div>
            )}

            {/* Speaking indicator */}
            {conversation.status === 'connected' && conversation.isSpeaking && (
              <div className="flex justify-start">
                <div className="bg-purple-100 px-4 py-2 rounded-lg flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-purple-600 animate-pulse" />
                  <span className="text-purple-600">AI is speaking...</span>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex gap-4">
            {!sessionStarted ? (
              <Button
                onClick={handleStartSession}
                className="bg-green-500 hover:bg-green-600"
                size="lg"
                disabled={!agentId || isConnecting}
              >
                <Play className="w-5 h-5 mr-2" />
                Start Exam
              </Button>
            ) : sessionEnded ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Exam Completed</span>
              </div>
            ) : (
              <>
                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                  conversation.status === 'connected'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {conversation.status === 'connected' ? (
                    <>
                      <Phone className="w-5 h-5" />
                      <span>In Conversation</span>
                    </>
                  ) : (
                    <>
                      <PhoneOff className="w-5 h-5" />
                      <span>Connecting...</span>
                    </>
                  )}
                </div>

                <Button
                  onClick={handleEndSession}
                  variant="destructive"
                  size="lg"
                  disabled={isConnecting}
                >
                  <StopCircle className="w-5 h-5 mr-2" />
                  End Exam
                </Button>
              </>
            )}
          </div>

          {/* Instructions */}
          {!sessionStarted && assignment.instructions && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Instructions:</strong> {assignment.instructions}
              </p>
            </div>
          )}

          {/* ElevenLabs Attribution */}
          <div className="mt-4 text-xs text-gray-500 text-center">
            Native voice conversation powered by ElevenLabs Conversational AI
          </div>
        </CardContent>
      </Card>
    </div>
  );
}