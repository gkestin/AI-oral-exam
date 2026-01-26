/**
 * ElevenLabs API Helper Functions
 * Creates agents dynamically based on assignment configuration
 */

import type { Assignment } from '@/types';

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

interface CreateAgentConfig {
  conversation_config: {
    agent: {
      name?: string;
      first_message: string;
      language: string;
      // The prompt object should be INSIDE the agent object
      prompt: {
        prompt: string;
        llm: string;
        temperature?: number;
        max_tokens?: number;
      };
    };
    tts?: {
      model_id?: string;
      voice_id?: string;
      stability?: number;
      similarity_boost?: number;
      speed?: number;
    };
  };
}

/**
 * Create a dynamic ElevenLabs agent based on assignment configuration
 */
export async function createDynamicAgent(
  assignment: Assignment,
  apiKey: string
): Promise<string> {
  // Build the agent configuration from assignment settings
  const config: CreateAgentConfig = {
    conversation_config: {
      agent: {
        name: `Exam Agent - ${assignment.title}`,
        // Use the actual instructions from the assignment as the first message
        first_message: assignment.instructions ||
          `Hello! I'm your AI examiner for "${assignment.title}". Let's begin with your identity verification. Please state your full name.`,
        language: assignment.voiceConfig?.elevenLabs?.language || 'en',
        // The prompt should be INSIDE the agent object!
        prompt: {
          // The prompt should contain ALL the exam context including instructions
          prompt: buildAgentPromptWithInstructions(assignment),
          llm: assignment.voiceConfig?.elevenLabs?.llmModel || 'gpt-4o', // Can be gpt-4o, claude-3-5-sonnet, etc.
          temperature: assignment.voiceConfig?.elevenLabs?.temperature || 0.7
        }
      },
      tts: {
        model_id: 'eleven_turbo_v2',
        voice_id: assignment.voiceConfig?.elevenLabs?.voiceId || '21m00Tcm4TlvDq8ikWAM', // Rachel's voice ID as default
        stability: 0.5,
        similarity_boost: 0.8,
        speed: 1.0
      }
    }
  };

  console.log('Creating ElevenLabs agent with config:', JSON.stringify(config, null, 2));

  try {
    const response = await fetch(`${ELEVENLABS_API_URL}/convai/agents/create`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('ElevenLabs API error response:', errorData);
      throw new Error(`Failed to create agent: ${response.statusText} - ${errorData}`);
    }

    const data = await response.json();
    console.log('ElevenLabs API response:', JSON.stringify(data, null, 2));
    return data.agent_id;
  } catch (error) {
    console.error('Error creating ElevenLabs agent:', error);
    throw error;
  }
}

/**
 * Build comprehensive agent prompt with instructions from assignment
 */
function buildAgentPromptWithInstructions(assignment: Assignment): string {
  // Start with the system prompt as the foundation
  let prompt = assignment.systemPrompt || `You are an AI examiner conducting an oral examination.
Be professional but friendly. Ask follow-up questions to assess understanding.
Keep responses concise for natural conversation.`;

  // Add exam instructions to guide how the AI should conduct the exam
  if (assignment.instructions) {
    prompt += `\n\nINSTRUCTIONS TO FOLLOW:\n${assignment.instructions}`;
  }

  // Add exam context
  prompt += `\n\nExam Title: ${assignment.title}`;

  if (assignment.description) {
    prompt += `\nExam Description: ${assignment.description}`;
  }

  // Add exam questions if provided
  if (assignment.knowledgeBase?.text) {
    prompt += `\n\nEXAM QUESTIONS AND ANSWERS:\n${assignment.knowledgeBase.text}`;
  }

  // Add grading rubric context
  if (assignment.grading?.enabled && assignment.grading.rubric.length > 0) {
    prompt += `\n\nGrading Criteria:`;
    assignment.grading.rubric.forEach(criteria => {
      prompt += `\n- ${criteria.name}: ${criteria.description} (Max Points: ${criteria.maxPoints})`;
    });
    prompt += `\n\nPay attention to these criteria when evaluating responses.`;
  }

  // Add mode-specific instructions
  switch (assignment.mode) {
    case 'practice':
      prompt += `\n\nThis is a PRACTICE session. Be helpful and provide hints when the student struggles. Offer constructive feedback.`;
      break;
    case 'interview':
      prompt += `\n\nThis is an INTERVIEW. Focus on assessing relevant skills and experience. Ask behavioral questions.`;
      break;
    case 'oral_exam':
      prompt += `\n\nThis is a FORMAL EXAM. Maintain professionalism. Do not provide hints unless the student is completely stuck.`;
      break;
  }

  // Add time context if there's a limit
  if (assignment.timeLimitMinutes) {
    prompt += `\n\nTime Limit: ${assignment.timeLimitMinutes} minutes. Pace the conversation appropriately.`;
  }

  return prompt;
}

/**
 * Build comprehensive agent prompt from assignment (legacy - kept for backward compatibility)
 */
function buildAgentPrompt(assignment: Assignment): string {
  let prompt = assignment.systemPrompt || `You are an AI examiner conducting an oral examination.
Be professional but friendly. Ask follow-up questions to assess understanding.
Keep responses concise for natural conversation.`;

  // Add exam context
  prompt += `\n\nExam Title: ${assignment.title}`;

  if (assignment.description) {
    prompt += `\nExam Description: ${assignment.description}`;
  }

  // Add exam questions if provided
  if (assignment.knowledgeBase?.text) {
    prompt += `\n\n${assignment.knowledgeBase.text}`;
  }

  // Add grading rubric context
  if (assignment.grading?.enabled && assignment.grading.rubric.length > 0) {
    prompt += `\n\nGrading Criteria:`;
    assignment.grading.rubric.forEach(criteria => {
      prompt += `\n- ${criteria.name}: ${criteria.description} (Max Points: ${criteria.maxPoints})`;
    });
    prompt += `\n\nPay attention to these criteria when evaluating responses.`;
  }

  // Add mode-specific instructions
  switch (assignment.mode) {
    case 'practice':
      prompt += `\n\nThis is a PRACTICE session. Be helpful and provide hints when the student struggles. Offer constructive feedback.`;
      break;
    case 'interview':
      prompt += `\n\nThis is an INTERVIEW. Focus on assessing relevant skills and experience. Ask behavioral questions.`;
      break;
    case 'oral_exam':
      prompt += `\n\nThis is a FORMAL EXAM. Maintain professionalism. Do not provide hints unless the student is completely stuck.`;
      break;
  }

  // Add time context if there's a limit
  if (assignment.timeLimitMinutes) {
    prompt += `\n\nTime Limit: ${assignment.timeLimitMinutes} minutes. Pace the conversation appropriately.`;
  }

  return prompt;
}

/**
 * Delete an agent after session ends (optional cleanup)
 */
export async function deleteAgent(agentId: string, apiKey: string): Promise<void> {
  try {
    await fetch(`${ELEVENLABS_API_URL}/convai/agents/${agentId}`, {
      method: 'DELETE',
      headers: {
        'xi-api-key': apiKey
      }
    });
  } catch (error) {
    console.error('Error deleting agent:', error);
    // Non-critical error, just log it
  }
}

/**
 * Get list of available voices
 */
export async function getAvailableVoices(apiKey: string): Promise<Array<{id: string, name: string}>> {
  try {
    const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
      headers: {
        'xi-api-key': apiKey
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch voices');
    }

    const data = await response.json();
    return data.voices.map((v: any) => ({
      id: v.voice_id,
      name: v.name
    }));
  } catch (error) {
    console.error('Error fetching voices:', error);
    return [];
  }
}

/**
 * Available LLM models for ElevenLabs agents
 * Updated with latest models from ElevenLabs platform
 */
export const ELEVENLABS_LLM_MODELS = [
  // ElevenLabs Models
  { id: 'glm-4.5-air', name: 'GLM-4.5-Air (~869ms, $0.02/min) - Great for agentic use' },
  { id: 'qwen3-30b-a3b', name: 'Qwen3-30B-A3B (~189ms, $0.006/min) - Ultra low latency' },

  // Anthropic Models
  { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5 (Latest) - ~1.46s, $0.06/min' },
  { id: 'claude-sonnet-4.5-20250929', name: 'Claude Sonnet 4.5 @20250929 - ~1.38s' },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4 - ~1.27s, $0.06/min' },
  { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5 - ~704ms, $0.02/min' },

  // OpenAI Models
  { id: 'gpt-5', name: 'GPT-5 - ~1.11s, $0.03/min' },
  { id: 'gpt-5.1', name: 'GPT-5.1 - ~1.11s, $0.03/min' },
  { id: 'gpt-5.2', name: 'GPT-5.2 (Latest) - ~844ms, $0.04/min' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini - ~884ms, $0.005/min' },
  { id: 'gpt-5-nano', name: 'GPT-5 Nano - ~823ms, $0.001/min' },
  { id: 'gpt-4.1', name: 'GPT-4.1 - ~753ms, $0.04/min' },

  // Google Models
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview - ~3.91s, $0.04/min' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview - ~1.49s, $0.01/min' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash - ~805ms, $0.003/min' }
];

/**
 * Popular ElevenLabs voices with their actual API IDs
 * Note: These are the actual voice IDs needed for the API, not just names
 */
export const ELEVENLABS_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Female, American)' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Male, Deep American)' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Male, American)' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (Female, Soft American)' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh (Male, Narrative American)' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli (Female, Young American)' },
  { id: 'jsCqWAovK2LkecY7zXl4', name: 'Domi (Female, Strong American)' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam (Male, Raspy American)' }
];