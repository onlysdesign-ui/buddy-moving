const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/analyze', (req, res) => {
  const task = typeof req.body?.task === 'string' ? req.body.task.trim() : '';
  if (!task) {
    return res.status(400).json({ error: 'task is required' });
  }

  return res.json({
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
  });
});

app.listen(port, () => {
  console.log(`Buddy Moving backend listening on port ${port}`);
});