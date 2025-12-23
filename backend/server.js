const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const OpenAI = require('openai');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const openaiClient = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/analyze', async (req, res) => {
  const task = typeof req.body?.task === 'string' ? req.body.task.trim() : '';
  if (!task) {
    return res.status(400).json({ error: 'task is required' });
  }

  const mockResponse = {
    analysis: {
      audience: ['New users', 'Returning users'],
      metrics: ['Activation rate', 'Conversion rate', 'Retention'],
      risks: ['Unclear success metric', 'Edge cases not covered'],
      approaches: [
        'Simplify the flow and reduce steps',
        'Add contextual hints and progressive disclosure',
        'A/B test variants and track key metrics',
      ],
    },
  };

  if (!openaiClient) {
    return res.json(mockResponse);
  }

  try {
    const response = await openaiClient.responses.create({
      model: openaiModel,
      input: [
        {
          role: 'system',
          content:
            'You are an assistant that returns UX/product analysis data in strict JSON.',
        },
        {
          role: 'user',
          content: `Generate analysis for the task: "${task}". Respond only with JSON.`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'analysis_response',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['analysis'],
            properties: {
              analysis: {
                type: 'object',
                additionalProperties: false,
                required: ['audience', 'metrics', 'risks', 'approaches'],
                properties: {
                  audience: { type: 'array', items: { type: 'string' } },
                  metrics: { type: 'array', items: { type: 'string' } },
                  risks: { type: 'array', items: { type: 'string' } },
                  approaches: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    });

    const jsonText = response.output_text;
    const parsed = jsonText ? JSON.parse(jsonText) : null;
    const analysis = parsed?.analysis;
    const isValid =
      analysis &&
      Array.isArray(analysis.audience) &&
      analysis.audience.every((item) => typeof item === 'string') &&
      Array.isArray(analysis.metrics) &&
      analysis.metrics.every((item) => typeof item === 'string') &&
      Array.isArray(analysis.risks) &&
      analysis.risks.every((item) => typeof item === 'string') &&
      Array.isArray(analysis.approaches) &&
      analysis.approaches.every((item) => typeof item === 'string');

    if (!isValid) {
      return res.json(mockResponse);
    }

    return res.json({ analysis });
  } catch (error) {
    console.error('OpenAI analyze error:', error);
    return res.json(mockResponse);
  }
});

app.listen(port, () => {
  console.log(`Buddy Moving backend listening on port ${port}`);
});
