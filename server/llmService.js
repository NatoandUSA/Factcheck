const { GoogleGenAI } = require('@google/genai');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

/**
 * Unified Multi-LLM Gateway supporting Google Gemini, OpenAI GPT, and Anthropic Claude
 */
async function callLLM({ provider = 'GEMINI', keys = {}, prompt, systemInstruction = '' }) {
  const activeProvider = String(provider || 'GEMINI').toUpperCase();

  // 1. Google Gemini
  if (activeProvider === 'GEMINI') {
    const apiKey = keys.gemini || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Google Gemini API Key is missing. Please enter it in Settings.');
    
    const client = new GoogleGenAI({ apiKey });
    const fullPrompt = systemInstruction ? `${systemInstruction}\n\n${prompt}` : prompt;
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: fullPrompt
    });
    return response.text;
  }

  // 2. OpenAI GPT-4o
  if (activeProvider === 'OPENAI' || activeProvider === 'GPT') {
    const apiKey = keys.openai || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OpenAI API Key is missing. Please enter it in Settings.');

    const openai = new OpenAI({ apiKey });
    const messages = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.7
    });
    return completion.choices[0]?.message?.content || '';
  }

  // 3. Anthropic Claude 3.5 Sonnet
  if (activeProvider === 'CLAUDE' || activeProvider === 'ANTHROPIC') {
    const apiKey = keys.claude || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!apiKey) throw new Error('Anthropic Claude API Key is missing. Please enter it in Settings.');

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      system: systemInstruction || 'You are an elite E-Commerce SEO and Copywriting AI assistant.',
      messages: [{ role: 'user', content: prompt }]
    });
    return message.content[0]?.text || '';
  }

  throw new Error(`Unsupported LLM provider: ${provider}`);
}

module.exports = { callLLM };
