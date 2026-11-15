// Durable history survives an installation move. Page/document bindings do not.
export const transientKeys=['runnerTabId','localTaskTabs','localSiteTabs','greenhouseUploadProofs','greenhouseReceiptSessions','localResultOutbox','localMigrationHold'];
export function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export function persistentStorage(data){return Object.fromEntries(Object.entries(data).filter(([key])=>!transientKeys.includes(key)));}
export function migrateStorage(original,{id,fromExtensionId,toExtensionId,at}){
 if(!original||typeof original!=='object'||!id||!fromExtensionId||!toExtensionId)throw new Error('MIGRATION_STORAGE_INVALID');
 const data=structuredClone(original),history={at,fromExtensionId,toExtensionId};
 for(const key of transientKeys)if(Object.hasOwn(data,key)&&key!=='localMigrationHold')history[key]=data[key];
 data.localMigrationArchives={...(data.localMigrationArchives||{}),[id]:history};
 for(const key of transientKeys)delete data[key];
 data.localTaskTabs={};data.localSiteTabs={};data.greenhouseUploadProofs={};data.greenhouseReceiptSessions={};data.localMigrationHold=true;
 return data;
}
