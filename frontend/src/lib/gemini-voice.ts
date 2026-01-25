/**
 * Gemini Live API Voice Service
 * Direct WebSocket connection to Gemini for real-time voice conversations
 */

interface GeminiConfig {
  apiKey: string;
  model?: string;
  systemInstruction?: string;
}

interface AudioProcessor {
  context: AudioContext;
  source?: MediaStreamAudioSourceNode;
  processor?: ScriptProcessorNode;
  stream?: MediaStream;
}

export class GeminiVoiceService {
  private ws: WebSocket | null = null;
  private audioProcessor: AudioProcessor | null = null;
  private audioQueue: Float32Array[] = [];
  private isConnected = false;
  private config: GeminiConfig;

  constructor(config: GeminiConfig) {
    this.config = {
      model: 'models/gemini-2.0-flash-exp',
      ...config
    };
  }

  async connect(sessionId: string, onMessage: (data: any) => void) {
    try {
      // For now, we'll use the proxy through our backend
      // In production, you'd connect directly to Gemini
      const wsUrl = `ws://localhost:8000/ws/gemini/${sessionId}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('Connected to Gemini Live API');
        this.isConnected = true;

        // Send setup message
        this.sendMessage({
          setup: {
            model: this.config.model,
            system_instruction: {
              parts: [{
                text: this.config.systemInstruction || "You are a helpful AI assistant conducting an oral examination."
              }]
            },
            generation_config: {
              response_modalities: ["AUDIO", "TEXT"],
              speech_config: {
                voice_config: {
                  prebuilt_voice_config: {
                    voice_name: "Kore"
                  }
                }
              }
            }
          }
        });
      };

      this.ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('Received from Gemini:', data);

        // Handle different message types
        if (data.setupComplete) {
          console.log('Setup complete, ready for conversation');
          onMessage({ type: 'ready' });
        } else if (data.serverContent) {
          // Handle AI response
          if (data.serverContent.modelTurn) {
            const turn = data.serverContent.modelTurn;

            // Extract text response
            if (turn.parts) {
              for (const part of turn.parts) {
                if (part.text) {
                  onMessage({
                    type: 'transcript',
                    text: part.text,
                    role: 'assistant'
                  });
                }

                // Handle audio response
                if (part.inlineData && part.inlineData.mimeType?.includes('audio')) {
                  await this.playAudio(part.inlineData.data);
                  onMessage({
                    type: 'audio',
                    role: 'assistant'
                  });
                }
              }
            }
          }
        } else if (data.toolCall) {
          onMessage({
            type: 'tool_call',
            data: data.toolCall
          });
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        onMessage({ type: 'error', error: 'Connection error' });
      };

      this.ws.onclose = () => {
        console.log('WebSocket closed');
        this.isConnected = false;
        this.stopAudioCapture();
        onMessage({ type: 'disconnected' });
      };

    } catch (error) {
      console.error('Failed to connect:', error);
      throw error;
    }
  }

  async startAudioCapture() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const context = new AudioContext({ sampleRate: 16000 });
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);

      this.audioProcessor = {
        context,
        source,
        processor,
        stream
      };

      let audioBuffer: Int16Array[] = [];
      let chunkSize = 16000; // 1 second chunks

      processor.onaudioprocess = (e) => {
        if (!this.isConnected) return;

        const inputData = e.inputBuffer.getChannelData(0);

        // Convert Float32 to Int16 PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        audioBuffer.push(pcmData);

        // Send when we have enough data
        const totalLength = audioBuffer.reduce((sum, arr) => sum + arr.length, 0);
        if (totalLength >= chunkSize) {
          // Combine buffers
          const combined = new Int16Array(totalLength);
          let offset = 0;
          for (const buffer of audioBuffer) {
            combined.set(buffer, offset);
            offset += buffer.length;
          }

          // Convert to base64
          const bytes = new Uint8Array(combined.buffer);
          const base64 = btoa(String.fromCharCode.apply(null, Array.from(bytes)));

          // Send to Gemini
          this.sendMessage({
            realtime_input: {
              media_chunks: [{
                mime_type: "audio/pcm;rate=16000",
                data: base64
              }]
            }
          });

          // Clear buffer
          audioBuffer = [];
        }
      };

      source.connect(processor);
      processor.connect(context.destination);

      console.log('Audio capture started');
    } catch (error) {
      console.error('Failed to start audio capture:', error);
      throw error;
    }
  }

  stopAudioCapture() {
    if (this.audioProcessor) {
      this.audioProcessor.processor?.disconnect();
      this.audioProcessor.source?.disconnect();
      this.audioProcessor.stream?.getTracks().forEach(track => track.stop());
      this.audioProcessor.context?.close();
      this.audioProcessor = null;
    }
    console.log('Audio capture stopped');
  }

  private async playAudio(base64Data: string) {
    try {
      // Convert base64 to array buffer
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Create audio context at 24kHz (Gemini output rate)
      const audioContext = new AudioContext({ sampleRate: 24000 });

      // Convert PCM data to AudioBuffer
      const int16Array = new Int16Array(bytes.buffer);
      const audioBuffer = audioContext.createBuffer(1, int16Array.length, 24000);
      const channelData = audioBuffer.getChannelData(0);

      // Convert Int16 to Float32
      for (let i = 0; i < int16Array.length; i++) {
        channelData[i] = int16Array[i] / 32768.0;
      }

      // Play the audio
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();

      // Wait for playback to complete
      await new Promise(resolve => {
        source.onended = resolve;
      });

    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  }

  sendMessage(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  sendText(text: string) {
    this.sendMessage({
      client_content: {
        turns: [{
          role: "user",
          parts: [{ text }]
        }]
      }
    });
  }

  disconnect() {
    this.stopAudioCapture();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}