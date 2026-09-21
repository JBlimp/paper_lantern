import { createInterface } from 'node:readline';
let serial = 0, timer, active, preferences;
const send = message => process.stdout.write(JSON.stringify(message) + '\n');
function complete(text, status = 'completed') {
  send({ method: 'item/completed', params: { threadId: active.threadId, item: { type: 'agentMessage', text } } });
  send({ method: 'turn/completed', params: { threadId: active.threadId, turn: { id: 'turn', status, items: [] } } });
}
createInterface({ input: process.stdin }).on('line', line => {
  const { id, method, params, error } = JSON.parse(line);
  const result = value => send({ id, result: value });
  if (id === 900 && !method) { complete(error?.code === -32601 ? 'tool denied' : 'tool allowed'); return; }
  if (method === 'initialize') result({});
  if (method === 'account/read') result({ account: { type: 'chatgpt' } });
  if (method === 'model/list') result({ data: [{ model: 'test-model', displayName: 'Test', isDefault: true }], nextCursor: null });
  if (method === 'thread/start') {
    preferences = params.developerInstructions;
    if (!params.ephemeral || params.sandbox !== 'read-only' || params.approvalPolicy !== 'never') { send({ id, error: { message: 'Unsafe thread configuration' } }); return; }
    result({ thread: { id: 'thread-' + ++serial } });
  }
  if (method === 'turn/start') {
    active = params;
    result({ turn: { id: 'turn' } });
    send({ method: 'turn/started', params: { threadId: params.threadId, turn: { id: 'turn' } } });
    const text = params.input[0].text;
    if (text === 'crash') process.exit(1);
    else if (text === 'tool') send({ id: 900, method: 'item/commandExecution/requestApproval', params: { threadId: params.threadId } });
    else if (text === 'stream') {
      send({method:'item/agentMessage/delta',params:{threadId:params.threadId,itemId:'answer',delta:'first'}});
      send({method:'item/agentMessage/delta',params:{threadId:params.threadId,itemId:'answer',delta:' second'}});
      timer=setTimeout(()=>complete('first second'),50);
    }
    else timer = setTimeout(() => complete(text === 'image' ? JSON.stringify(params.input[1]) : text === 'preferences' ? preferences : 'answer'), text === 'hold' ? 60000 : 10);
  }
  if (method === 'turn/interrupt') { clearTimeout(timer); result({}); complete('', 'interrupted'); }
  if (method === 'thread/unsubscribe') result({});
});
