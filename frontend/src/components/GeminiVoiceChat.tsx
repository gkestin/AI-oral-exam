'use client';

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Mic, MicOff, Volume2, VolumeX, Bot, User, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function GeminiVoiceChat() {
  const [isListening, setIsListening] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recognitionRef = useRef<any>(null);
  const genAIRef = useRef<any>(null);
  const modelRef = useRef<any>(null);

  useEffect(() => {
    // Initialize Gemini
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) {
      setError('Please add your Gemini API key to .env.local');
      return;
    }

    try {
      // Initialize Gemini
      const genAI = new GoogleGenerativeAI(apiKey);

      // Use the latest Gemini model (Jan 2026)
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp',  // Latest experimental flash model
        generationConfig: {
          temperature: 0.9,
          topK: 1,
          topP: 1,
          maxOutputTokens: 2048,
        },
        systemInstruction: `You are an AI examiner conducting an oral examination.
          Be professional but friendly. Ask follow-up questions to assess understanding.
          Keep responses concise for natural conversation.`
      });

      genAIRef.current = genAI;
      modelRef.current = model;
      setIsConnected(true);

      // Load voices for speech synthesis
      if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices(); // This loads voices
        // Some browsers need an event listener to load voices
        window.speechSynthesis.onvoiceschanged = () => {
          console.log('Voices loaded:', window.speechSynthesis.getVoices().length);
        };
      }

      // Initialize speech recognition
      initializeSpeechRecognition();

      // Send initial greeting
      handleAIResponse("Hello! I'm your AI examiner. Let's begin with your identity verification. Please state your full name.");

    } catch (err) {
      console.error('Failed to initialize Gemini:', err);
      setError('Failed to initialize Gemini. Please check your API key.');
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      window.speechSynthesis.cancel();
    };
  }, []);

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
      if (isSpeaking) {
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
      if (!isSpeaking) {
        setTranscript(interimTranscript);
      }

      if (finalTranscript && !isSpeaking) {
        // Add user message
        const userMessage: Message = {
          role: 'user',
          content: finalTranscript,
          timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setTranscript('');

        // Stop recognition while processing
        recognition.stop();
        setIsProcessing(true);

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
      console.log('Speech recognition ended');
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  };

  const getGeminiResponse = async (userInput: string) => {
    if (!modelRef.current) {
      setError('Gemini model not initialized');
      setIsProcessing(false);
      return;
    }

    try {
      // Build conversation history
      const history = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));

      // Start chat with history
      const chat = modelRef.current.startChat({ history });

      // Send message and get response
      const result = await chat.sendMessage(userInput);
      const response = await result.response;
      const text = response.text();

      // Add AI response (will handle recognition restart after speaking)
      await handleAIResponse(text);

      setIsProcessing(false);

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

    // Clear any lingering transcript when AI starts responding
    setTranscript('');

    // Stop recognition and mark as speaking
    setIsSpeaking(true);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort(); // Use abort instead of stop to clear buffer
      } catch (e) {
        try {
          recognitionRef.current.stop();
        } catch (e2) {
          console.log('Recognition already stopped');
        }
      }
    }

    // Use better quality voice synthesis
    if (!isMuted) {
      await speakWithBetterVoice(text);
    }

    // Mark speaking as done and restart recognition
    setIsSpeaking(false);

    // Restart recognition after a short delay
    setTimeout(() => {
      if (recognitionRef.current && !isProcessing) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.log('Recognition already started');
        }
      }
    }, 500);
  };

  const speakWithBetterVoice = async (text: string) => {
    // Using browser TTS with optimized settings for better quality
    return new Promise<void>((resolve) => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);

        // Optimize voice settings for more natural sound
        utterance.rate = 0.95;  // Slightly slower for clarity
        utterance.pitch = 1.05;  // Slightly higher pitch
        utterance.volume = 1.0;

        // Get available voices and select the best one
        const voices = window.speechSynthesis.getVoices();

        // Try to find Google voices first (they sound better)
        const googleVoice = voices.find(voice =>
          voice.name.includes('Google') &&
          voice.lang.startsWith('en')
        );

        // Or find any high-quality English voice
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
      // If muting, cancel current speech
      window.speechSynthesis.cancel();
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Card>
        <CardContent className="p-6">
          <div className="mb-4">
            <h2 className="text-2xl font-bold mb-2">AI Oral Examination</h2>
            <p className="text-sm text-gray-600">
              Powered by Gemini AI with natural voice conversation
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
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="text-sm text-gray-600">
              {isConnected ? 'Connected to Gemini AI' : 'Disconnected'}
            </span>
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

            {/* Current transcript - only show when user is speaking */}
            {transcript && !isSpeaking && (
              <div className="flex justify-end">
                <div className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg italic">
                  {transcript}...
                </div>
              </div>
            )}

            {/* Processing indicator */}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-gray-100 px-4 py-2 rounded-lg flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-gray-600">Thinking...</span>
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
              disabled={!isConnected || isProcessing}
            >
              {isListening ? (
                <>
                  <MicOff className="w-5 h-5 mr-2" />
                  Stop Listening
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
          </div>

          {/* Instructions */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              <strong>How to use:</strong> Click "Start Listening" and speak naturally.
              Gemini AI will respond with contextual follow-up questions for your oral exam.
              The conversation uses your browser's speech recognition and synthesis with
              Gemini's advanced language model.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}