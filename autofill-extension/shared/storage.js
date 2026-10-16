import {validateProfile} from './schema.js';
export async function lockStorage() {
  await chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
}
export async function loadProfile() {
  await lockStorage();
  const {profile} = await chrome.storage.local.get('profile');
  return profile ? validateProfile(profile) : null;
}
export async function saveProfile(profile) {
  const validated = validateProfile(profile);
  await lockStorage();
  await chrome.storage.local.set({profile: validated});
}
export async function getMappings(site) {
  await lockStorage();
  const {mappings = {}} = await chrome.storage.local.get('mappings');
  return mappings[site] || [];
}
export async function saveMappings(site, rows) {
  await lockStorage();
  const {mappings = {}} = await chrome.storage.local.get('mappings');
  mappings[site] = rows;
  await chrome.storage.local.set({mappings});
}
export async function clearData() {
  await lockStorage();
  await chrome.storage.local.remove(['profile', 'mappings']);
}
