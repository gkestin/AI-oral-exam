'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useConversation } from '@elevenlabs/react';
import { Mic, MicOff, Volume2, VolumeX, Bot, User, Loader2, Play, StopCircle, AlertCircle, CheckCircle, Phone, PhoneOff } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { api, ApiError } from '@/lib/api';
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
  const [tentativeTranscript, setTentativeTranscript] = useState('');
  const [currentMode, setCurrentMode] = useState<'listening' | 'speaking' | null>(null);
  const [idleWarning, setIdleWarning] = useState(false);
  const [showSettingsLink, setShowSettingsLink] = useState(false);

  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<Date | null>(null);
  const lastInteractionAtRef = useRef<number>(Date.now());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Initialize ElevenLabs conversation
  const conversation = useConversation({
    onConnect: ({ conversationId }) => {
      setIsConnecting(false);
      setError(null);
      setShowSettingsLink(false);
    },
    onDisconnect: () => {
      if (!sessionEnded) {
        setError('Connection lost. Please refresh and try again.');
      }
    },
    onMessage: ({ message, source }) => {

      // Clear tentative transcript when message is finalized
      if (source === 'user') {
        setTentativeTranscript('');
      }

      // Extract content from message object - it might be a string or an object
      let content = '';
      if (typeof message === 'string') {
        content = message;
      } else if (typeof message === 'object' && message !== null) {
        // Type guard for object type
        const msgObj = message as any;
        if (msgObj.text) {
          content = msgObj.text;
        } else if (msgObj.content) {
          content = msgObj.content;
        } else {
          // Fallback to stringifying the message
          content = JSON.stringify(message);
        }
      } else {
        content = String(message);
      }

      // Only add non-empty messages
      if (content && content.trim()) {
        lastInteractionAtRef.current = Date.now();
        setIdleWarning(false);
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
    onError: (error: any) => {
      const errorMessage = typeof error === 'string' ? error :
                         (error?.message || error?.toString() || 'Unknown error');
      setError(`Voice connection error: ${errorMessage}`);
      setIsConnecting(false);
    },
    onModeChange: ({ mode }) => {
      console.log('[Mode Change] New mode:', mode, 'Previous:', currentMode, 'Status:', conversation.status);
      setCurrentMode(mode as 'listening' | 'speaking');

      // Start/stop browser speech recognition based on mode
      // Only process if we're connected
      if (conversation.status === 'connected' && recognitionRef.current) {
        if (mode === 'listening') {
          console.log('[Recognition] Mode is listening - ensuring recognition is running...');
          // Always try to start when in listening mode
          // The recognition API will ignore if already started
          try {
            recognitionRef.current.start();
            console.log('[Recognition] Start command sent');
          } catch (e: any) {
            if (e.message && e.message.includes('already started')) {
              console.log('[Recognition] Already running (good)');
            } else {
              console.log('[Recognition] Start failed:', e.message);
              // Try again after a short delay
              setTimeout(() => {
                try {
                  recognitionRef.current.start();
                  console.log('[Recognition] Retry successful');
                } catch (retryError) {
                  console.log('[Recognition] Retry also failed');
                }
              }, 200);
            }
          }
        } else if (mode === 'speaking') {
          console.log('[Recognition] Mode is speaking - stopping recognition...');
          try {
            recognitionRef.current.stop();
            // DON'T clear tentativeTranscript here - let it stay visible until the message appears
            console.log('[Recognition] Stop command sent');
          } catch (e: any) {
            console.log('[Recognition] Stop failed (may already be stopped):', e.message);
          }
        }
      }
    },
    onStatusChange: ({ status }) => {
      // Silently track status changes
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
        try {
          const result = await api.sessions.getElevenLabsAgent(courseId, sessionId);
          setAgentId(result.agent_id);
        } catch (err: any) {
          const apiErr = err as ApiError;
          if (apiErr?.code === 'elevenlabs_key_required') {
            setShowSettingsLink(true);
            setError('ElevenLabs key required for this account. Add it in API Key Settings to continue voice sessions.');
          } else {
            setError(`Failed to create voice agent: ${apiErr?.detail || apiErr?.message || 'Unknown error'}`);
          }
        } finally {
          // Reset flag after request completes
          creatingAgentRef.current = false;
        }
      } else {
        setError('Invalid ElevenLabs configuration - please configure an agent');
      }
    };

    setupAgent();
  }, [assignment, courseId, sessionId]);

  // Initialize browser speech recognition for interim transcripts
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          console.log('[Recognition] Started successfully');
        };

        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          if (interimTranscript) {
            console.log('[Recognition] Interim:', interimTranscript.substring(0, 50) + '...');
            setTentativeTranscript(interimTranscript);
          }
          if (finalTranscript) {
            console.log('[Recognition] Final:', finalTranscript.substring(0, 50) + '...');
            // DON'T clear the tentative transcript here!
            // Keep showing it until ElevenLabs actually creates the message
            // This prevents the gap between interim disappearing and final appearing
            // The tentative will be cleared in onMessage when the actual message arrives
          }
        };

        recognition.onerror = (event: any) => {
          console.log('[Recognition] Error:', event.error);
          // Try to restart if we're still connected and not ended
          if (conversation.status === 'connected' && !sessionEnded) {
            setTimeout(() => {
              try {
                console.log('[Recognition] Attempting restart after error...');
                recognition.start();
              } catch (e) {
                console.log('[Recognition] Restart after error failed');
              }
            }, 500);
          }
        };

        recognition.onend = () => {
          console.log('[Recognition] Ended. Status:', conversation.status, 'Mode:', currentMode, 'SessionEnded:', sessionEnded);

          // Always try to restart if conversation is connected and session not ended
          // This ensures we're always ready to capture speech when in listening mode
          if (conversation.status === 'connected' && !sessionEnded) {
            // If we're currently in listening mode, restart immediately
            // If in speaking mode, we'll restart when mode changes back to listening
            if (currentMode === 'listening') {
              console.log('[Recognition] In listening mode - restarting immediately...');
              setTimeout(() => {
                try {
                  recognition.start();
                  console.log('[Recognition] Restarted successfully');
                } catch (e) {
                  console.log('[Recognition] Restart failed, will retry on next mode change');
                }
              }, 50);
            } else {
              console.log('[Recognition] In speaking mode - will restart when mode changes to listening');
            }
          } else {
            console.log('[Recognition] Not restarting (disconnected or session ended)');
          }
        };

        recognitionRef.current = recognition;
      }
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, [conversation.status, sessionStarted, sessionEnded, currentMode]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, tentativeTranscript]);

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

  // Auto-stop when there is no back-and-forth for too long.
  useEffect(() => {
    if (!sessionStarted || sessionEnded) return;

    idleTimerRef.current = setInterval(() => {
      const idleMs = Date.now() - lastInteractionAtRef.current;
      if (idleMs >= 60_000) {
        setIdleWarning(false);
        handleEndSession();
      } else if (idleMs >= 30_000) {
        setIdleWarning(true);
      } else {
        setIdleWarning(false);
      }
    }, 2000);

    return () => {
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    };
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
      lastInteractionAtRef.current = Date.now();
      setIdleWarning(false);

      if (onSessionStart) {
        onSessionStart();
      }

      // Start ElevenLabs conversation
      // For public agents (no auth required)
      await conversation.startSession({
        agentId: agentId,
        connectionType: 'webrtc' // Use WebRTC for better real-time performance
      });

      // Start browser speech recognition for interim transcripts
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e: any) {
          // Silently handle errors - speech recognition is a nice-to-have feature
        }
      }

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

    // Stop browser speech recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        console.log('Stopped browser speech recognition on session end');
      } catch (e) {
        // Ignore errors during cleanup
      }
    }

    // Clear tentative transcript
    setTentativeTranscript('');

    // End ElevenLabs conversation
    if (conversation.status === 'connected') {
      await conversation.endSession();
    }

    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
    }
    if (idleTimerRef.current) {
      clearInterval(idleTimerRef.current);
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

    // Add mode-specific instructions
    if (assignment.mode === 'mock_interview') {
      prompt += `\n\nThis is a mock interview. Focus on assessing relevant skills and experience.`;
    } else if (assignment.mode === 'ai_tutor') {
      prompt += `\n\nYou are an AI tutor. Be helpful and provide hints when needed.`;
    } else if (assignment.mode === 'socratic') {
      prompt += `\n\nUse the Socratic method - ask probing questions to guide understanding.`;
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
              <div>
                <p>{error}</p>
                {showSettingsLink && (
                  <Link href="/dashboard/settings" className="underline font-medium">
                    Open API Key Settings
                  </Link>
                )}
              </div>
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
          {idleWarning && !sessionEnded && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No recent back-and-forth detected. This session will auto-end after 60 seconds of inactivity.
            </div>
          )}

          {/* Messages Container with Status Indicators */}
          <div className="relative mb-6">
            {/* Messages */}
            <div className="h-96 overflow-y-auto space-y-4 p-4 bg-gray-50 rounded-lg pb-16">
              {messages.map((msg, idx) => {
                // Check if this is the most recent AI message and AI is currently speaking
                const isCurrentlySpeaking = msg.role === 'assistant' &&
                  idx === messages.length - 1 &&
                  conversation.status === 'connected' &&
                  conversation.isSpeaking;

                return (
                  <div
                    key={idx}
                    className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex gap-3 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                        msg.role === 'user' ? 'bg-blue-500' :
                        isCurrentlySpeaking ? 'bg-purple-500 shadow-lg shadow-purple-400/50 animate-pulse' : 'bg-purple-500'
                      }`}>
                        {msg.role === 'user' ?
                          <User className="w-4 h-4 text-white" /> :
                          <Bot className="w-4 h-4 text-white" />
                        }
                      </div>
                      <div className={`px-4 py-2 rounded-lg transition-all duration-300 ${
                        msg.role === 'user' ?
                          'bg-blue-500 text-white' :
                          isCurrentlySpeaking ?
                            'bg-white border-2 border-purple-300 shadow-lg shadow-purple-200/50' :
                            'bg-white border'
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
                );
              })}

              {/* Tentative transcript while user is speaking */}
              {tentativeTranscript && tentativeTranscript.trim() && (
                <div className="flex justify-end transition-all duration-300 ease-out">
                  <div className="flex gap-3 max-w-[80%] flex-row-reverse">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-400 animate-pulse">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg transition-opacity duration-300">
                      <p className="italic">{tentativeTranscript}...</p>
                      <p className="text-xs text-blue-500 mt-1 animate-pulse">Speaking...</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Auto-scroll anchor */}
              <div ref={messagesEndRef} />
            </div>

            {/* Fixed Status Indicators at Bottom */}
            <div className="absolute bottom-0 left-0 right-0 p-4 pointer-events-none">
              {/* Connection indicator */}
              <div className={`flex justify-center mb-2 transition-all duration-300 ${
                isConnecting ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-4'
              }`}>
                <div className="bg-gray-100 px-4 py-2 rounded-lg flex items-center gap-2 shadow-md pointer-events-auto">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-gray-600">Connecting to AI...</span>
                </div>
              </div>

              {/* Speaking indicator with smooth fade */}
              <div className={`flex justify-center transition-all duration-500 ease-in-out ${
                conversation.status === 'connected' && conversation.isSpeaking
                  ? 'opacity-100 transform translate-y-0'
                  : 'opacity-0 transform translate-y-2'
              }`}>
                <div className="bg-gradient-to-r from-purple-100 to-purple-50 px-4 py-2 rounded-lg flex items-center gap-2 shadow-md pointer-events-auto">
                  <div className="relative">
                    <Volume2 className="w-4 h-4 text-purple-600 animate-pulse" />
                    <div className="absolute inset-0 w-4 h-4 bg-purple-400 rounded-full blur-md opacity-60 animate-ping" />
                  </div>
                  <span className="text-purple-600 font-medium">AI is speaking...</span>
                </div>
              </div>
            </div>
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