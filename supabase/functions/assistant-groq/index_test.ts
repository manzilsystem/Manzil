import { assertEquals } from 'jsr:@std/assert@1'
import { handleRequest } from './index.ts'

const endpoint = 'https://example.test/functions/v1/assistant-groq'
const appOrigin = Deno.env.get('APP_ORIGIN') || 'https://manzilsystem.github.io'

async function call(body: unknown, headers: Record<string, string> = {}) {
  return handleRequest(new Request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }))
}

Deno.test('OPTIONS answers CORS preflight without touching the key', async () => {
  const response = await handleRequest(new Request(endpoint, { method: 'OPTIONS' }))
  assertEquals(response.status, 200)
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), appOrigin)
  assertEquals(response.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS')
  assertEquals(await response.text(), 'ok')
})

Deno.test('only POST is allowed', async () => {
  const response = await handleRequest(new Request(endpoint))
  assertEquals(response.status, 405)
  assertEquals(await response.json(), { error: 'method_not_allowed' })
})

Deno.test('health is public and never reveals a key', async () => {
  const response = await call({ action: 'health' })
  assertEquals(response.status, 200)
  const text = await response.text()
  const body = JSON.parse(text)
  assertEquals(body.enabled, Boolean(Deno.env.get('GROQ_API_KEY')))
  assertEquals(body.ttsModel, 'canopylabs/orpheus-arabic-saudi')
  assertEquals(body.ttsVoice, 'abdullah')
  assertEquals(/gsk_|secret|password|token/i.test(text), false)
})

Deno.test('data actions require a Supabase JWT', async () => {
  const chat = await call({ action: 'chat', answerId: 'cashbox', question: 'رصيد الخزنة؟', facts: '100 جنيه' })
  assertEquals(chat.status, 401)
  assertEquals(await chat.json(), { error: 'unauthorized' })

  const audio = new FormData()
  audio.append('audio', new File([new Uint8Array(1024)], 'voice.webm', { type: 'audio/webm' }))
  const transcribe = await handleRequest(new Request(endpoint, { method: 'POST', body: audio }))
  assertEquals(transcribe.status, 401)

  const speak = await call({ action: 'speak', text: 'أ/سمير الشافعي' })
  assertEquals(speak.status, 401)
  assertEquals(await speak.json(), { error: 'unauthorized' })
})

Deno.test('unknown actions are rejected after authentication is checked', async () => {
  const response = await call({ action: 'unknown' }, { Authorization: 'Bearer invalid' })
  assertEquals(response.status, 401)
})
