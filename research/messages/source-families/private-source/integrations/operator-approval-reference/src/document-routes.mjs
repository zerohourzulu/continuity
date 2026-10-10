// Document mode shares the workbench's loopback/Origin/body/concurrency guards.
// No route supplies a UID/socket, invokes an agent, or changes broker policy.
const slug = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,31}$/.exec(value)?.[0] === value;
const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const utf8 = (value, maximum) => typeof value === 'string' && value.isWellFormed()
  && Buffer.byteLength(value) > 0 && Buffer.byteLength(value) <= maximum;
export function documentRoute(method, route) {
  if (method === 'GET' && route === '/api/document/desk') return { operation: 'desk' };
  if (method === 'POST' && route === '/api/document/reviews') return { operation: 'createReview' };
  const match = /^\/api\/document\/reviews\/([a-z][a-z0-9-]{0,31})(?:\/(challenge|display|decision|recover)|\/approvals\/([a-z][a-z0-9-]{0,31})\/release-request)?$/.exec(route);
  if (!match || match[0] !== route) return null;
  const operation = match[3] ? 'exportAgentRequest' : ({challenge:'downloadChallenge',display:'downloadDisplay',decision:'importDecision',recover:'recover'}[match[2]] ?? 'view');
  if (method !== (['importDecision','recover'].includes(operation) ? 'POST' : 'GET')) return null;
  return { operation, reviewId: match[1], approvalId: match[3] };
}
export async function dispatchDocument({ application, selected, body, readOnly, send, failure }) {
  const { operation, reviewId, approvalId } = selected;
  if (readOnly && ['createReview','importDecision','recover','exportAgentRequest'].includes(operation)) throw failure(403,'READ_ONLY');
  if (operation === 'desk') {
    const value = await application.desk();
    send(200,{...value,accessMode:readOnly?'READ_ONLY':'CONTROLLED_USE',available:readOnly?{createReview:false}:value.available});
  } else if (operation === 'view') {
    const value = await application.view(reviewId);
    send(200,{...value,available:readOnly?{importDecision:false,exportAgentRequest:false,recover:false}:value.available});
  } else if (operation === 'downloadChallenge' || operation === 'downloadDisplay') {
    const value = await application[operation](reviewId);
    if (typeof value !== 'string') throw failure(500,'INVALID_APPLICATION_RESPONSE');
    send(200,value,'application/json; charset=utf-8',`${operation==='downloadChallenge'?'challenge':'review-display'}-${reviewId}.json`);
  } else if (operation === 'exportAgentRequest') {
    const result = await application.exportAgentRequest(reviewId,approvalId);
    if (typeof result?.requestUtf8 !== 'string' || result.reviewId !== reviewId || result.approvalId !== approvalId || result.status !== 'AGENT_REQUEST_EXPORTED_NOT_EXECUTED') throw failure(500,'INVALID_APPLICATION_RESPONSE');
    send(200,result.requestUtf8,'application/json; charset=utf-8',`agent-request-${reviewId}-${approvalId}.json`);
  } else if (operation === 'createReview') {
    if (!closed(body,['reviewId','who','proposalUtf8']) || !slug(body.reviewId) || !['a','b'].includes(body.who) || !utf8(body.proposalUtf8,2048)) throw failure(400,'INVALID_DOCUMENT_REVIEW_BODY');
    const result = await application.createReview(body.reviewId,body.who,body.proposalUtf8);
    send(200,{status:result.status,reviewId:result.reviewId});
  } else if (operation === 'importDecision') {
    if (!closed(body,['approvalId','envelopeUtf8']) || !slug(body.approvalId) || !utf8(body.envelopeUtf8,16384)) throw failure(400,'INVALID_DOCUMENT_DECISION_BODY');
    send(200,await application.importDecision(reviewId,body.approvalId,body.envelopeUtf8));
  } else {
    if (!closed(body,[])) throw failure(400,'INVALID_EMPTY_BODY');
    send(200,await application.recover(reviewId));
  }
}
