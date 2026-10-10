// Presentation projections only. No authority, credential, file access or effects.
export function projectDuty(duty) {
  return {obligationId:duty.record.obligationId,description:duty.record.description,
    durableRoleId:duty.record.durableRoleId,status:duty.status,
    performanceAssigneeId:duty.performanceAssigneeId,
    originalPerformanceAssigneeId:duty.record.performanceAssigneeId};
}
export function summarizeReview(v) {
  const {admission,invocation,reconciliation}=v.outcome;
  let attention='RECORDED';
  if(v.approval.status==='STALE') attention='STALE_REVIEW';
  else if(v.approval.status==='PENDING') attention='PENDING_DECISION';
  else if(v.approval.status==='DENIED') attention='DENIED';
  else if(v.available.invoke) attention='READY_TO_INVOKE';
  else if(v.approval.status==='APPROVED') attention=v.available.admit?'READY_FOR_ADMISSION':'PERMISSION_REQUIRED';
  else if(v.approval.status==='SPENT' && admission===null) attention='ATTEMPT_RESULT_UNAVAILABLE';
  else if(reconciliation?.status==='RETRY' && reconciliation.recorded===true) attention='ORIGINAL_RESULT_RECOVERED';
  else if(reconciliation!==null) attention='RECOVERY_RECORDED';
  else if(admission?.status==='ADMITTED' && (invocation===null || invocation.status==='OUTCOME_UNKNOWN'))
    attention=v.available.reconcile?'RECOVERY_AVAILABLE':'OUTCOME_UNRESOLVED';
  return {challengeId:v.challenge.challengeId,readStatus:'READABLE',preparedFrom:v.preparation?.parentChallengeId??null,actionId:v.selection.actionId,
    action:v.selection.descriptor.action,actorId:v.selection.actorBinding.actorId,
    expectedRevision:v.selection.descriptor.expectedRevision,reviewHead:v.selection.reviewHead,
    approvalStatus:v.approval.status,decision:v.approval.decision,
    contextStatus:v.current.contextStatus,permission:v.current.permission.decision,attention,
    phases:{admission:admission?.status??null,invocation:invocation?.status??null,
      reconciliation:reconciliation?.status??null,reconciliationRecorded:reconciliation?.recorded??null}};
}
