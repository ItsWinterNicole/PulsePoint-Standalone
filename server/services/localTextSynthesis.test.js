import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getLocalTextSynthesisHealth,
  invokeLocalTextSynthesis,
} from './localTextSynthesis.js';

test('local text synthesis health is explicit when model is not configured', async () => {
  const previousModel = process.env.LOCAL_LLM_MODEL;
  delete process.env.LOCAL_LLM_MODEL;
  try {
    const health = await getLocalTextSynthesisHealth();
    assert.equal(health.ok, false);
    assert.equal(health.configured, false);
    assert.match(health.error, /LOCAL_LLM_MODEL/i);
  } finally {
    if (previousModel == null) delete process.env.LOCAL_LLM_MODEL;
    else process.env.LOCAL_LLM_MODEL = previousModel;
  }
});

test('local text synthesis fails before any provider/cloud call when model is missing', async () => {
  const previousModel = process.env.LOCAL_LLM_MODEL;
  const previousFetch = globalThis.fetch;
  let fetchCalled = false;
  delete process.env.LOCAL_LLM_MODEL;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called');
  };
  try {
    await assert.rejects(
      () => invokeLocalTextSynthesis({ prompt: 'hello', response_json_schema: { type: 'object' } }),
      /LOCAL_LLM_MODEL/i,
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousModel == null) delete process.env.LOCAL_LLM_MODEL;
    else process.env.LOCAL_LLM_MODEL = previousModel;
  }
});
