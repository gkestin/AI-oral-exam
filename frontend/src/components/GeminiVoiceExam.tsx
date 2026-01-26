'use client';

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Mic, MicOff, Volume2, VolumeX, Bot, User, Loader2, Play, StopCircle, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { api } from '@/lib/api';
import type { Assignment, Session } from '@/types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface GeminiVoiceExamProps {
  sessionId: string;
  courseId: string;
  assignment: Assignment;
  onSessionEnd?: (transcript: Message[]) => void;
  onSessionStart?: () => void;
}

export default function GeminiVoiceExam({
  sessionId,
  courseId,
  assignment,
  onSessionEnd,
  onSessionStart
}: GeminiVoiceExamProps) {
  const [isListening, setIsListening] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  const recognitionRef = useRef<any>(null);
  const genAIRef = useRef<any>(null);
  const modelRef = useRef<any>(null);
  const chatRef = useRef<any>(null); // Store the chat session
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<Date | null>(null);

  // Use refs for state that needs to be accessed in event handlers
  const isSpeakingRef = useRef(false);
  const sessionStartedRef = useRef(false);
  const sessionEndedRef = useRef(false);
  const isProcessingRef = useRef(false);

  // Build system prompt from assignment configuration
  const buildSystemPrompt = () => {
    let prompt = assignment.systemPrompt || `You are an AI examiner conducting an oral examination.
Be professional but friendly. Ask follow-up questions to assess understanding.
Keep responses concise for natural conversation.`;

    // Add exam title context
    prompt += `\n\nExam Title: ${assignment.title}`;

    // Add description if available
    if (assignment.description) {
      prompt += `\nExam Description: ${assignment.description}`;
    }

    // Add questions if provided in knowledge base
    if (assignment.knowledgeBase?.text) {
      prompt += `\n\n${assignment.knowledgeBase.text}`;
    }

    // Add grading rubric context if enabled
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

  useEffect(() => {
    // Initialize Gemini
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) {
      setError('Please add your Gemini API key to .env.local');
      return;
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp',
        generationConfig: {
          temperature: 0.9,
          topK: 1,
          topP: 1,
          maxOutputTokens: 2048,
        },
        systemInstruction: buildSystemPrompt()
      });

      genAIRef.current = genAI;
      modelRef.current = model;

      // Initialize chat session with system prompt
      chatRef.current = model.startChat({
        history: [],
        generationConfig: {
          temperature: 0.9,
          topK: 1,
          topP: 1,
          maxOutputTokens: 2048,
        }
      });

      setIsConnected(true);

      // Load voices for speech synthesis
      if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
          console.log('Voices loaded:', window.speechSynthesis.getVoices().length);
        };
      }

      // Initialize speech recognition
      initializeSpeechRecognition();

    } catch (err) {
      console.error('Failed to initialize Gemini:', err);
      setError('Failed to initialize Gemini. Please check your API key.');
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
      }
      window.speechSynthesis.cancel();
    };
  }, []);

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

  const initializeSpeechRecognition = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setError('Speech recognition not supported in your browser');
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      console.log('Speech recognition started');
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = async (event: any) => {
      // Don't process results if AI is speaking
      if (isSpeakingRef.current) {
        return;
      }

      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      // Only show transcript if not speaking
      if (!isSpeakingRef.current) {
        setTranscript(interimTranscript);
      }

      if (finalTranscript && !isSpeakingRef.current) {
        // Add user message
        const userMessage: Message = {
          role: 'user',
          content: finalTranscript,
          timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setTranscript('');

        // Save to backend
        try {
          await api.sessions.addMessage(courseId, sessionId, {
            role: 'user',
            content: finalTranscript
          });
        } catch (err) {
          console.error('Failed to save user message:', err);
        }

        // Stop recognition while processing
        recognition.stop();
        setIsProcessing(true);
        isProcessingRef.current = true;

        // Get AI response
        await getGeminiResponse(finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      setError(`Speech recognition error: ${event.error}`);
    };

    recognition.onend = () => {
      console.log('Speech recognition ended, session states:', {
        sessionStarted: sessionStartedRef.current,
        sessionEnded: sessionEndedRef.current,
        isProcessing: isProcessingRef.current,
        isSpeaking: isSpeakingRef.current
      });

      // Just update UI state - let handleAIResponse handle restart after speaking
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  };

  const getGeminiResponse = async (userInput: string) => {
    if (!chatRef.current) {
      setError('Chat session not initialized');
      setIsProcessing(false);
      return;
    }

    try {
      // Use the persistent chat session
      const result = await chatRef.current.sendMessage(userInput);
      const response = await result.response;
      const text = response.text();

      // Add AI response
      await handleAIResponse(text);

      setIsProcessing(false);
      isProcessingRef.current = false;
      // Don't restart here - let handleAIResponse do it after speaking

    } catch (err: any) {
      console.error('Gemini error:', err);
      setError(`AI Error: ${err.message}`);
      setIsProcessing(false);
    }
  };

  const handleAIResponse = async (text: string) => {
    const assistantMessage: Message = {
      role: 'assistant',
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, assistantMessage]);

    // Save to backend
    try {
      await api.sessions.addMessage(courseId, sessionId, {
        role: 'assistant',
        content: text
      });
    } catch (err) {
      console.error('Failed to save assistant message:', err);
    }

    // Clear any lingering transcript when AI starts responding
    setTranscript('');

    // Stop recognition and mark as speaking
    setIsSpeaking(true);
    isSpeakingRef.current = true;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        try {
          recognitionRef.current.stop();
        } catch (e2) {
          console.log('Recognition already stopped');
        }
      }
    }

    // Use voice synthesis
    if (!isMuted) {
      await speakWithBetterVoice(text);
    }

    // Mark speaking as done AFTER the voice synthesis completes
    setIsSpeaking(false);
    isSpeakingRef.current = false;

    // Always restart recognition after speaking if session is active
    // Small delay to ensure speech synthesis is fully done
    setTimeout(() => {
      if (recognitionRef.current && sessionStartedRef.current && !sessionEndedRef.current) {
        try {
          recognitionRef.current.start();
          setIsListening(true);
          console.log('Recognition restarted after AI response');
        } catch (e) {
          console.log('Could not restart recognition:', e);
          setIsListening(false);
        }
      }
    }, 500);
  };

  const speakWithBetterVoice = async (text: string) => {
    return new Promise<void>((resolve) => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);

        // Optimize voice settings
        utterance.rate = 0.95;
        utterance.pitch = 1.05;
        utterance.volume = 1.0;

        // Get available voices and select the best one
        const voices = window.speechSynthesis.getVoices();
        const googleVoice = voices.find(voice =>
          voice.name.includes('Google') && voice.lang.startsWith('en')
        );
        const qualityVoice = voices.find(voice =>
          (voice.name.includes('Samantha') ||
           voice.name.includes('Alex') ||
           voice.name.includes('Karen') ||
           voice.name.includes('Daniel')) &&
          voice.lang.startsWith('en')
        );

        if (googleVoice) {
          utterance.voice = googleVoice;
        } else if (qualityVoice) {
          utterance.voice = qualityVoice;
        }

        utterance.onend = () => {
          console.log('Speech synthesis ended');
          resolve();
        };

        utterance.onerror = (error) => {
          console.error('Speech synthesis error:', error);
          resolve();
        };

        console.log('Starting speech synthesis:', text);
        window.speechSynthesis.speak(utterance);
      } else {
        console.error('Speech synthesis not supported');
        resolve();
      }
    });
  };

  const handleStartSession = async () => {
    try {
      // Start session in backend
      await api.sessions.start(courseId, sessionId);

      setSessionStarted(true);
      sessionStartedRef.current = true;
      startTimeRef.current = new Date();

      if (onSessionStart) {
        onSessionStart();
      }

      // Send initial greeting
      const greeting = `Hello! I'm your AI examiner for "${assignment.title}". ${assignment.instructions || 'Let\'s begin with your identity verification. Please state your full name.'}`;

      // handleAIResponse will save it to backend
      await handleAIResponse(greeting);

      // Start listening automatically and keep it on
      setTimeout(() => {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.start();
            setIsListening(true);
          } catch (e) {
            console.log('Recognition already started');
          }
        }
      }, 1000);
    } catch (err) {
      console.error('Failed to start session:', err);
      setError('Failed to start session');
    }
  };

  const handleEndSession = async () => {
    setSessionEnded(true);
    sessionEndedRef.current = true;
    setIsSpeaking(false); // Stop speaking state
    isSpeakingRef.current = false;
    setIsListening(false);

    // Stop recognition cleanly
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        try {
          recognitionRef.current.stop();
        } catch (e2) {
          console.log('Recognition already stopped');
        }
      }
    }

    // Cancel any ongoing speech synthesis safely
    try {
      window.speechSynthesis.cancel();
    } catch (err) {
      console.log('Speech synthesis already stopped');
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
      // Don't throw - session is already ended on frontend
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.log('Recognition already started');
      }
    }
  };

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    if (newMutedState) {
      window.speechSynthesis.cancel();
    }
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
              {assignment.description || 'AI-powered oral examination with Gemini'}
            </p>
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
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className="text-sm text-gray-600">
                {isConnected ? 'Connected to Gemini AI' : 'Disconnected'}
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

            {/* Current transcript */}
            {transcript && !isSpeaking && (
              <div className="flex justify-end">
                <div className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg italic">
                  {transcript}...
                </div>
              </div>
            )}

            {/* Processing/Speaking indicator */}
            {(isProcessing || isSpeaking) && (
              <div className="flex justify-start">
                <div className="bg-gray-100 px-4 py-2 rounded-lg flex items-center gap-2">
                  {isSpeaking ? (
                    <>
                      <Volume2 className="w-4 h-4 text-purple-600 animate-pulse" />
                      <span className="text-gray-600">Speaking...</span>
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-gray-600">Thinking...</span>
                    </>
                  )}
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
                disabled={!isConnected}
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
                <Button
                  onClick={toggleListening}
                  className={isListening
                    ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                    : 'bg-green-500 hover:bg-green-600 text-white'
                  }
                  size="lg"
                  disabled={!isConnected || isProcessing}
                >
                  {isListening ? (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                        <MicOff className="w-5 h-5" />
                        <span>Stop Listening</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <Mic className="w-5 h-5 mr-2" />
                      Start Listening
                    </>
                  )}
                </Button>

                <Button
                  onClick={toggleMute}
                  variant="outline"
                  size="lg"
                >
                  {isMuted ? (
                    <>
                      <VolumeX className="w-5 h-5 mr-2" />
                      Unmute
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-5 h-5 mr-2" />
                      Mute
                    </>
                  )}
                </Button>

                <Button
                  onClick={handleEndSession}
                  variant="destructive"
                  size="lg"
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
        </CardContent>
      </Card>
    </div>
  );
}