'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Play,
  Pause,
  StopCircle,
  Loader2,
  MessageSquare,
  User,
  Bot,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { useAuth } from '@/lib/hooks/useAuth';

interface VoiceConversationProps {
  sessionId: string;
  courseId: string;
  assignmentTitle?: string;
  onSessionEnd?: (transcript: TranscriptMessage[]) => void;
}

interface TranscriptMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  audioUrl?: string;
}

interface AgentPhase {
  current: 'authentication' | 'project_discussion' | 'case_analysis' | 'completed';
  progress: number;
}

export default function VoiceConversation({
  sessionId,
  courseId,
  assignmentTitle = 'Oral Examination',
  onSessionEnd
}: VoiceConversationProps) {
  const { user, token } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // Development mode: Use a mock token if no auth available
  const isDevelopment = process.env.NODE_ENV === 'development';
  const effectiveToken = token || (isDevelopment ? 'dev-mock-token' : null);

  // Debug logging
  useEffect(() => {
    console.log('VoiceConversation Debug:', {
      user: user?.email,
      userId: user?.uid,
      token: token ? `Token exists (${token.substring(0, 20)}...)` : 'No token',
      effectiveToken: effectiveToken ? 'Has effective token' : 'No effective token',
      sessionId,
      courseId,
      apiUrl: process.env.NEXT_PUBLIC_API_URL,
      isAuthenticated: !!user && !!token,
      isDevelopment
    });
  }, [user, token, effectiveToken, sessionId, courseId, isDevelopment]);
  const [isMuted, setIsMuted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [agentPhase, setAgentPhase] = useState<AgentPhase>({
    current: 'authentication',
    progress: 0
  });
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!effectiveToken) {
      setError('Authentication required');
      return;
    }

    const wsUrl = `${process.env.NEXT_PUBLIC_API_URL?.replace('http', 'ws').replace('/api', '')}/ws/voice/${courseId}/${sessionId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setError(null);

      // Send authentication
      ws.send(JSON.stringify({ token: effectiveToken }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.error) {
        setError(data.error);
        return;
      }

      switch (data.type) {
        case 'greeting':
        case 'response':
          // Add to transcript
          if (data.transcript) {
            setTranscript(prev => [...prev, {
              role: 'user',
              content: data.transcript,
              timestamp: new Date().toISOString()
            }]);
          }

          if (data.response_text) {
            setTranscript(prev => [...prev, {
              role: 'assistant',
              content: data.response_text,
              timestamp: new Date().toISOString()
            }]);

            // Play audio response if available
            if (data.response_audio) {
              playAudioResponse(data.response_audio);
            }
          }

          // Update agent phase
          if (data.agent_phase) {
            updateAgentPhase(data.agent_phase);
          }

          setIsProcessing(false);
          break;

        case 'session_ended':
          handleSessionEnd(data.data);
          break;

        default:
          console.log('Unknown message type:', data.type);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('Connection error. Please try again.');
      setIsConnected(false);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      setIsRecording(false);
    };

    wsRef.current = ws;
  }, [effectiveToken, courseId, sessionId]);

  const updateAgentPhase = (phase: string) => {
    const phases = ['authentication', 'project_discussion', 'case_analysis', 'completed'];
    const currentIndex = phases.indexOf(phase);

    setAgentPhase({
      current: phase as AgentPhase['current'],
      progress: ((currentIndex + 1) / phases.length) * 100
    });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Set up audio visualization
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;

      // Start visualization
      visualizeAudio();

      // Set up MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          // Convert to base64 and send
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result?.toString().split(',')[1];
            if (base64) {
              wsRef.current?.send(JSON.stringify({
                type: 'audio',
                data: base64
              }));
              setIsProcessing(true);
            }
          };
          reader.readAsDataURL(event.data);
        }
      };

      mediaRecorder.start(1000); // Send chunks every second
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    setAudioLevel(0);
  };

  const visualizeAudio = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate average volume
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    setAudioLevel(average / 255);

    animationFrameRef.current = requestAnimationFrame(visualizeAudio);
  };

  const playAudioResponse = async (base64Audio: string) => {
    try {
      const audioBlob = new Blob(
        [Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0))],
        { type: 'audio/wav' }
      );
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      if (!isMuted) {
        await audio.play();
      }
    } catch (err) {
      console.error('Error playing audio:', err);
    }
  };

  const handleSessionEnd = (sessionData: any) => {
    setAgentPhase({ current: 'completed', progress: 100 });
    if (onSessionEnd) {
      onSessionEnd(transcript);
    }
  };

  const endSession = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end_session' }));
    }
    stopRecording();
  };

  const phaseLabels = {
    authentication: 'Identity Verification',
    project_discussion: 'Project Discussion',
    case_analysis: 'Case Analysis',
    completed: 'Examination Complete'
  };

  const phaseIcons = {
    authentication: <User className="w-4 h-4" />,
    project_discussion: <MessageSquare className="w-4 h-4" />,
    case_analysis: <Bot className="w-4 h-4" />,
    completed: <CheckCircle className="w-4 h-4" />
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
        <CardContent className="py-6">
          <h2 className="text-2xl font-bold mb-2">{assignmentTitle}</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {phaseIcons[agentPhase.current]}
              <span className="text-sm font-medium">
                {phaseLabels[agentPhase.current]}
              </span>
            </div>
            <div className="flex-1">
              <div className="bg-white/20 rounded-full h-2">
                <motion.div
                  className="bg-white h-2 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${agentPhase.progress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Alert */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-red-50 border border-red-200 rounded-lg p-4"
          >
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Transcript */}
        <div className="lg:col-span-2">
          <Card className="h-[500px] flex flex-col">
            <div className="p-4 border-b">
              <h3 className="font-semibold">Conversation Transcript</h3>
            </div>
            <CardContent className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                {transcript.length === 0 ? (
                  <div className="text-center text-gray-500 py-12">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Click "Start Session" to begin your examination</p>
                  </div>
                ) : (
                  transcript.map((msg, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                      className={`flex gap-3 ${
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div className={`flex gap-3 max-w-[80%] ${
                        msg.role === 'user' ? 'flex-row-reverse' : ''
                      }`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          msg.role === 'user'
                            ? 'bg-indigo-100 text-indigo-600'
                            : 'bg-purple-100 text-purple-600'
                        }`}>
                          {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                        </div>
                        <div className={`px-4 py-2 rounded-2xl ${
                          msg.role === 'user'
                            ? 'bg-indigo-500 text-white'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          <p className="text-sm">{msg.content}</p>
                          <p className={`text-xs mt-1 ${
                            msg.role === 'user' ? 'text-indigo-200' : 'text-gray-500'
                          }`}>
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
                <div ref={transcriptEndRef} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Controls */}
        <div className="space-y-4">
          {/* Voice Visualizer */}
          <Card>
            <CardContent className="py-8">
              <div className="relative">
                {/* Animated circles for voice visualization */}
                <div className="relative w-32 h-32 mx-auto">
                  <motion.div
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600"
                    animate={{
                      scale: isRecording ? [1, 1.2, 1] : 1,
                      opacity: isRecording ? [0.3, 0.1, 0.3] : 0.1
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                  <motion.div
                    className="absolute inset-4 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600"
                    animate={{
                      scale: isRecording ? [1, 1.15, 1] : 1,
                      opacity: isRecording ? [0.5, 0.2, 0.5] : 0.2
                    }}
                    transition={{
                      duration: 2,
                      delay: 0.2,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                  <motion.div
                    className="absolute inset-8 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center"
                    animate={{
                      scale: isRecording ? [1, 1.1, 1] : 1
                    }}
                    transition={{
                      duration: 2,
                      delay: 0.4,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  >
                    {isProcessing ? (
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    ) : isRecording ? (
                      <Mic className="w-8 h-8 text-white" />
                    ) : (
                      <MicOff className="w-8 h-8 text-white" />
                    )}
                  </motion.div>
                </div>

                {/* Audio level indicator */}
                {isRecording && (
                  <div className="mt-4">
                    <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                      <motion.div
                        className="bg-gradient-to-r from-indigo-500 to-purple-600 h-2"
                        animate={{ width: `${audioLevel * 100}%` }}
                        transition={{ duration: 0.1 }}
                      />
                    </div>
                    <p className="text-xs text-center mt-2 text-gray-600">
                      {isProcessing ? 'Processing...' : 'Listening...'}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Control Buttons */}
          <Card>
            <CardContent className="space-y-4 py-4">
              {!isConnected ? (
                <>
                  <Button
                    className="w-full"
                    onClick={connectWebSocket}
                    disabled={!effectiveToken}
                  >
                    {!effectiveToken ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Authenticating...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Start Session
                      </>
                    )}
                  </Button>
                  {isDevelopment && !token && (
                    <p className="text-xs text-green-600 mt-2 text-center">
                      Development mode: Using mock authentication
                    </p>
                  )}
                  {!isDevelopment && !token && !user && (
                    <p className="text-xs text-amber-600 mt-2 text-center">
                      Please log in to start your session
                    </p>
                  )}
                  {!isDevelopment && !token && user && (
                    <p className="text-xs text-blue-600 mt-2 text-center">
                      Fetching authentication token...
                    </p>
                  )}
                </>
              ) : (
                <>
                  <Button
                    className={`w-full ${isRecording ? 'bg-red-500 hover:bg-red-600' : ''}`}
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isProcessing}
                  >
                    {isRecording ? (
                      <>
                        <Pause className="w-4 h-4 mr-2" />
                        Stop Recording
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4 mr-2" />
                        Start Recording
                      </>
                    )}
                  </Button>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setIsMuted(!isMuted)}
                    >
                      {isMuted ? (
                        <>
                          <VolumeX className="w-4 h-4 mr-2" />
                          Unmute
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-4 h-4 mr-2" />
                          Mute
                        </>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={endSession}
                    >
                      <StopCircle className="w-4 h-4 mr-2" />
                      End
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Session Info */}
          <Card>
            <CardContent className="py-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Status</span>
                <span className={`font-medium ${
                  isConnected ? 'text-green-600' : 'text-gray-400'
                }`}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Messages</span>
                <span className="font-medium">{transcript.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Phase</span>
                <span className="font-medium">{phaseLabels[agentPhase.current]}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}