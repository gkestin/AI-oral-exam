'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Bot, User, Loader2, Wifi, WifiOff } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  audio?: boolean;
}

export default function GeminiLiveVoice() {
  const [isListening, setIsListening] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const connectWebSocket = async () => {
    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('API key not found');
      }

      // Connect to Gemini Live API WebSocket
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`;

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);

        // Send initial setup message
        const setupMessage = {
          setup: {
            model: 'models/gemini-2.0-flash-exp',
            generationConfig: {
              responseModalities: ['AUDIO', 'TEXT'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: 'Aoede' // Natural voice
                  }
                }
              }
            },
            systemInstruction: {
              parts: [{
                text: `You are an AI examiner conducting an oral examination.
                Be professional but friendly. Ask follow-up questions to assess understanding.
                Keep responses concise for natural conversation.
                Start by asking for the student's name and field of study.`
              }]
            }
          }
        };

        // Add authentication
        const authMessage = {
          ...setupMessage,
          auth: {
            token: apiKey
          }
        };

        ws.send(JSON.stringify(authMessage));
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('Received:', data);

        if (data.serverContent) {
          // Handle server responses
          if (data.serverContent.modelTurn) {
            const turn = data.serverContent.modelTurn;

            // Handle text response
            if (turn.parts) {
              for (const part of turn.parts) {
                if (part.text) {
                  handleAIResponse(part.text, false);
                }

                // Handle audio response
                if (part.inlineData && part.inlineData.mimeType === 'audio/pcm;rate=24000') {
                  const audioData = base64ToArrayBuffer(part.inlineData.data);
                  audioQueueRef.current.push(audioData);
                  if (!isMuted) {
                    playAudioQueue();
                  }
                }
              }
            }
          }

          // Handle transcription
          if (data.serverContent.turnComplete) {
            setCurrentTranscript('');
          }
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('WebSocket connection error');
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
      };

      wsRef.current = ws;

    } catch (err: any) {
      console.error('Connection error:', err);
      setError(`Failed to connect: ${err.message}`);
    }
  };

  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const playAudioQueue = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }

    const audioData = audioQueueRef.current.shift()!;

    // Convert PCM to audio buffer
    const int16Array = new Int16Array(audioData);
    const float32Array = new Float32Array(int16Array.length);

    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768;
    }

    const audioBuffer = audioContextRef.current.createBuffer(1, float32Array.length, 24000);
    audioBuffer.copyToChannel(float32Array, 0);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);

    source.onended = () => {
      isPlayingRef.current = false;
      playAudioQueue(); // Play next in queue
    };

    source.start();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      });

      // Create audio context for 16kHz
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);

      // Create script processor for capturing PCM
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);

        // Convert Float32 to Int16 PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Send audio to WebSocket
        const message = {
          realtimeInput: {
            mediaChunks: [{
              data: arrayBufferToBase64(pcmData.buffer),
              mimeType: 'audio/pcm;rate=16000'
            }]
          }
        };

        wsRef.current.send(JSON.stringify(message));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      // Store for cleanup
      mediaRecorderRef.current = { stop: () => {
        processor.disconnect();
        source.disconnect();
        stream.getTracks().forEach(track => track.stop());
        audioContext.close();
      }} as any;

      setIsListening(true);

    } catch (err: any) {
      console.error('Failed to start recording:', err);
      setError(`Failed to start recording: ${err.message}`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsListening(false);
  };

  const handleAIResponse = (text: string, isAudio: boolean) => {
    const assistantMessage: Message = {
      role: 'assistant',
      content: text,
      timestamp: new Date(),
      audio: isAudio
    };

    setMessages(prev => [...prev, assistantMessage]);
  };

  const toggleListening = async () => {
    if (isListening) {
      stopRecording();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    } else {
      await connectWebSocket();
      // Wait for connection before starting recording
      setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          startRecording();
        }
      }, 500);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (isMuted) {
      playAudioQueue();
    }
  };

  // Use simpler approach with existing Gemini API for now
  useEffect(() => {
    // Show initial message
    handleAIResponse(
      "Note: Direct WebSocket to Gemini Live API requires server-side proxy for security. " +
      "The current implementation demonstrates the concept. For production, implement a backend proxy " +
      "that handles authentication and forwards audio streams securely.",
      false
    );
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Card>
        <CardContent className="p-6">
          <div className="mb-4">
            <h2 className="text-2xl font-bold mb-2">Gemini Live Voice - Natural Speech</h2>
            <p className="text-sm text-gray-600">
              WebSocket-based implementation for natural voice conversations
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Connection Status */}
          <div className="mb-4 flex items-center gap-2">
            {isConnected ? (
              <>
                <Wifi className="w-4 h-4 text-green-500" />
                <span className="text-sm text-gray-600">Connected to Gemini Live API</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">Not connected</span>
              </>
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
                    <div className={`text-xs mt-1 flex items-center gap-1 ${
                      msg.role === 'user' ? 'text-blue-200' : 'text-gray-500'
                    }`}>
                      {msg.audio && <Volume2 className="w-3 h-3" />}
                      {msg.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Current transcript */}
            {currentTranscript && (
              <div className="flex justify-end">
                <div className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg italic flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {currentTranscript}...
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex gap-4">
            <Button
              onClick={toggleListening}
              className={isListening ? 'bg-red-500 hover:bg-red-600' : ''}
              size="lg"
            >
              {isListening ? (
                <>
                  <MicOff className="w-5 h-5 mr-2" />
                  Stop Conversation
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5 mr-2" />
                  Start Conversation
                </>
              )}
            </Button>

            <Button
              onClick={toggleMute}
              variant="outline"
              size="lg"
              disabled={!isListening}
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
          </div>

          {/* Instructions */}
          <div className="mt-6 p-4 bg-amber-50 rounded-lg">
            <p className="text-sm text-amber-700">
              <strong>Implementation Note:</strong> For production use, the WebSocket connection to Gemini Live API
              should be proxied through your backend server for security. Direct client-side API key usage is not recommended.
            </p>
            <p className="text-sm text-amber-700 mt-2">
              Visit <strong>/gemini-voice</strong> to use the current working implementation with browser TTS.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}