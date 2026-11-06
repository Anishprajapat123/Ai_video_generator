import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyFlowCompatibility } from './flow-compat.mjs';

const root = path.resolve(import.meta.dirname, '..');
const connector = path.join(root, 'storage/tools/flow-mcp/dist');
process.env.FLOW_MCP_HOME = path.join(root, 'storage/flow-session');
process.env.FLOW_MCP_OUTPUT = path.join(root, 'storage/flow-output');
const port = 8787;
process.env.FLOW_MCP_PORT = String(port);
const mode = process.argv[2] || 'status';
const moduleUrl = name => pathToFileURL(path.join(connector, name + '.js')).href;

async function call(method, body) {
  const health = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) });
  if ((await health.json()).name !== 'flow-mcp') throw new Error('Port 8787 belongs to another service.');
  const token = (await readFile(path.join(process.env.FLOW_MCP_HOME, 'token'), 'utf8')).trim();
  const response = await fetch(`http://127.0.0.1:${port}/api/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-flow-token': token },
    body: JSON.stringify(body), signal: AbortSignal.timeout(45000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Flow connector request failed.');
  return result;
}

async function main() {
  if (!existsSync(path.join(connector, 'index.js'))) throw new Error('Flow connector is not installed. See docs/google-flow.md.');
  await applyFlowCompatibility(path.dirname(connector));
  if (mode === 'inspect') {
    const { getFlowPage } = await import(moduleUrl('chrome'));
    const page = await getFlowPage();
    const controls = await page.getByRole('button').evaluateAll(elements => elements.map(element => ({ name: element.getAttribute('aria-label') || element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 100) || '', pressed: element.getAttribute('aria-pressed'), parent: element.parentElement?.tagName })).filter(item => !/Google Account|Account details/i.test(item.name)));
    const menus = await page.getByRole('menuitem').allTextContents();
    const options = await page.getByRole('radio').allTextContents();
    console.log(JSON.stringify({ projectOpen: /\/project\//.test(page.url()), controls, menus, options, creditsSpent: 0 }));
    process.exit(0);
  }
  if (mode === 'check') {
    const sdk = path.join(connector, '../node_modules/@modelcontextprotocol/sdk/dist/esm/client');
    const { Client } = await import(pathToFileURL(path.join(sdk, 'index.js')).href);
    const { StdioClientTransport } = await import(pathToFileURL(path.join(sdk, 'stdio.js')).href);
    const client = new Client({ name: 'studio-flow-check', version: '1.0.0' });
    try {
      await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'scripts/flow-connector.mjs'), 'mcp'], stderr: 'pipe' }));
      const result = await client.listTools();
      for (const name of ['flow_status', 'flow_generate', 'flow_wait']) if (!result.tools.some(tool => tool.name === name)) throw new Error('Missing MCP tool: ' + name);
      console.log(JSON.stringify({ mcp: 'connected', tools: result.tools.length, creditsSpent: 0 }));
    } finally { await client.close(); }
    return;
  }
  if (mode === 'mcp' || mode === 'login') { await import(moduleUrl(mode === 'mcp' ? 'index' : 'login')); return; }
  if (mode === 'serve') {
    const { LocalCore } = await import(moduleUrl('core'));
    const { startServer } = await import(moduleUrl('server'));
    const role = await startServer(new LocalCore());
    if (role === 'none') throw new Error('Port 8787 is occupied.');
    console.log('Flow connector: http://127.0.0.1:8787 (' + role + ')');
    return;
  }
  if (!['status', 'smoke'].includes(mode)) throw new Error('Use login, serve, status, smoke, inspect, check or mcp.');
  if (mode === 'smoke' && !process.argv.includes('--allow-credits')) throw new Error('Credit spending is blocked. Add --allow-credits only when explicitly approving the capped test.');
  const result = await call('status', { detailed: true });
  const state = result.flow;
  console.log(JSON.stringify({ signedIn: state?.signedIn, inProject: state?.inProject, credits: state?.credits_remaining, hint: state?.hint }));
  if (mode === 'status') return;
  if (!state?.signedIn || !state.inProject) throw new Error('Sign in and open a Flow project before testing.');
  if (!Number.isFinite(state.credits_remaining) || state.credits_remaining < 10) throw new Error('At least 10 confirmed Flow credits are required. No generation submitted.');
  if (result.jobs?.some(job => ['queued', 'running'].includes(job.status))) throw new Error('A Flow job is already active. Check it before submitting another.');
  const submitted = await call('generate', { project: 'studio-flow-check', scenes: [{
    prompt: 'A calm cinematic shot of a natural waterfall flowing over rocky cliffs into a clear pool, slow camera push forward, daylight, no text.',
    type: 'video', model: 'Veo 3.1 - Lite', aspect_ratio: '16:9', variants: 1, max_credits: 10, retries: 0, download_quality: 'original',
  }] });
  const ids = submitted.jobs.map(job => job.id);
  console.log(JSON.stringify({ jobs: ids, maximumCredits: 10, automaticRetries: 0 }));
  for (let attempt = 0; attempt < 30; attempt++) {
    const progress = await call('wait', { job_ids: ids, timeout_seconds: 20 });
    console.log(JSON.stringify(progress));
    if (progress.finished) {
      if (!progress.jobs?.length || progress.jobs.some(job => job.status !== 'done' || !job.files?.length)) throw new Error('Flow test did not produce a downloaded clip. Check the reported job; no automatic retry was submitted.');
      return;
    }
  }
  throw new Error('Flow is still running. Check the existing job in Flow; do not submit another test.');
}

main().catch(error => { console.error(error.message || 'Flow connector failed.'); process.exitCode = 1; });
