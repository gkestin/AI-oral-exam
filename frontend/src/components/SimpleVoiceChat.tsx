'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Bot, User } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function SimpleVoiceChat() {
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState('');

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    // Check for browser support
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      console.error('Speech recognition not supported');
      return;
    }

    // Initialize speech recognition
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      console.log('Speech recognition started');
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
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

      setTranscript(interimTranscript);

      if (finalTranscript) {
        // Add user message
        const userMessage: Message = {
          role: 'user',
          content: finalTranscript,
          timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setTranscript('');

        // Stop recognition temporarily to process
        recognition.stop();

        // Send to backend and get response
        handleUserInput(finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    // Add initial greeting
    const greeting = "Hello! I'm your AI examiner. Please state your name to begin.";
    setMessages([{
      role: 'assistant',
      content: greeting,
      timestamp: new Date()
    }]);
    speak(greeting);

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const handleUserInput = async (text: string) => {
    try {
      // Simple response generation for testing
      // In production, this would call your backend API
      const response = await generateResponse(text);

      const assistantMessage: Message = {
        role: 'assistant',
        content: response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Speak the response
      if (!isMuted) {
        await speak(response);
      }

      // Resume listening after speaking
      setTimeout(() => {
        if (recognitionRef.current && !isListening) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            console.log('Already listening');
          }
        }
      }, 500);

    } catch (error) {
      console.error('Error handling input:', error);
    }
  };

  const generateResponse = async (input: string): Promise<string> => {
    // Simple rule-based responses for testing
    const lowerInput = input.toLowerCase();

    if (lowerInput.includes('my name is') || lowerInput.includes("i'm") || lowerInput.includes('i am')) {
      return "Thank you for confirming your identity. Now, let's discuss your project. Can you tell me about the main problem your project solves?";
    }

    if (lowerInput.includes('project') || lowerInput.includes('solve') || lowerInput.includes('problem')) {
      return "That's interesting! What technologies did you use to implement this solution?";
    }

    if (lowerInput.includes('react') || lowerInput.includes('python') || lowerInput.includes('javascript') || lowerInput.includes('technology')) {
      return "Good choice of technologies. What was the biggest challenge you faced during development?";
    }

    if (lowerInput.includes('challenge') || lowerInput.includes('difficult') || lowerInput.includes('hard')) {
      return "I see. How did you overcome that challenge?";
    }

    if (lowerInput.includes('test') || lowerInput.includes('hello')) {
      return "Hello! I can hear you clearly. Please tell me about yourself.";
    }

    // Default response
    return "That's a good point. Can you elaborate on that further?";
  };

  const speak = (text: string): Promise<void> => {
    return new Promise((resolve) => {
      if ('speechSynthesis' in window) {
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Select a voice (preferably female for variety)
        const voices = window.speechSynthesis.getVoices();
        const femaleVoice = voices.find(voice =>
          voice.name.includes('Female') ||
          voice.name.includes('Samantha') ||
          voice.name.includes('Victoria')
        );
        if (femaleVoice) {
          utterance.voice = femaleVoice;
        }

        utterance.onend = () => {
          resolve();
        };

        synthRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      } else {
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
    setIsMuted(!isMuted);
    if (synthRef.current) {
      window.speechSynthesis.cancel();
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Card>
        <CardContent className="p-6">
          <h2 className="text-2xl font-bold mb-6">Voice Conversation Test</h2>

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
            {transcript && (
              <div className="flex justify-end">
                <div className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg italic">
                  {transcript}...
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
                  Unmuted
                </>
              ) : (
                <>
                  <Volume2 className="w-5 h-5 mr-2" />
                  Muted
                </>
              )}
            </Button>
          </div>

          {/* Instructions */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              <strong>Instructions:</strong> Click "Start Listening" and speak clearly.
              The AI will respond to your voice input. This uses your browser's built-in
              speech recognition and synthesis.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}