import GeminiVoiceChat from '@/components/GeminiVoiceChat';

export default function GeminiVoicePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold text-center mb-8">
          Gemini AI Voice Examination
        </h1>
        <GeminiVoiceChat />
      </div>
    </div>
  );
}