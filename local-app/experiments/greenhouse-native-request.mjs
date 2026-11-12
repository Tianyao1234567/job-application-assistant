// Offline wrapper for the historical pinned client and trusted test inputs.
// This entry point still exposes no send, release or receipt interface.
import {receiptScope,verifiedUpload,boundApplication} from '../../autofill-extension/greenhouse-receipts.js';
import {createNativeCapture,sha256} from '../../autofill-extension/runner/greenhouse-native-request.js';

export {sha256};
export const CLIENT_SHA256='378c96ee0ba18cc20667ed84f7822c0d78d833296d843097040c47e2dfba2728';

export async function createOfflineCapture({spec,schema,expected}) {
  ({spec,schema,expected}=structuredClone({spec,schema,expected}));
  if(!receiptScope(spec)||!verifiedUpload(spec)||spec.clientSha256!==CLIENT_SHA256||
    await sha256(JSON.stringify(schema))!==spec.schemaSha256)throw new Error('OFFLINE_NATIVE_AUTHORIZATION');
  const application=expected.application;
  if(!application||application.resume||application.resume_text||application.cover_letter||application.cover_letter_url||application.cover_letter_text||
    application.attachments&&Object.keys(application.attachments).length||!await boundApplication(spec,{job_application:application}))throw new Error('OFFLINE_NATIVE_UPLOAD_BINDING');
  return createNativeCapture({spec,expected,scope:'offline-only'});
}
