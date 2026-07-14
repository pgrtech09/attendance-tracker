import { supabase } from './supabase-client.js';
import { initShell, toast } from './app.js';

const shell = await initShell('profile');
if (!shell) throw new Error('no session');
const userId = shell.session.user.id;

let profile = null;
await loadProfile();

async function loadProfile() {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
  profile = data;
  document.getElementById('profileName').textContent = profile.full_name;
  document.getElementById('profileRoll').textContent = profile.roll_number;
  document.getElementById('fullName').value = profile.full_name;
  document.getElementById('branch').value = profile.branch;
  document.getElementById('section').value = profile.section;
  document.getElementById('year').value = profile.year;
  document.getElementById('semester').value = profile.semester;
  document.getElementById('rollNumberDisplay').value = profile.roll_number;

  const initialsEl = document.getElementById('avatarInitials');
  const imgEl = document.getElementById('avatarPreview');
  if (profile.avatar_url) {
    imgEl.src = profile.avatar_url;
    imgEl.style.display = 'block';
    initialsEl.style.display = 'none';
  } else {
    initialsEl.textContent = profile.full_name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
    initialsEl.style.display = 'flex';
    imgEl.style.display = 'none';
  }
}

document.getElementById('avatarInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) { toast('Image must be under 3MB'); return; }

  const ext = file.name.split('.').pop();
  const path = `${userId}/avatar.${ext}`;
  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
  if (uploadError) { toast('Upload failed: ' + uploadError.message); return; }

  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
  const avatarUrl = `${pub.publicUrl}?t=${Date.now()}`;
  const { error: updateError } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', userId);
  if (updateError) { toast('Could not save avatar'); return; }

  toast('Profile picture updated ✓');
  await loadProfile();
});

document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('saveProfileBtn');
  btn.disabled = true; btn.textContent = 'Saving…';
  const payload = {
    full_name: document.getElementById('fullName').value.trim(),
    branch: document.getElementById('branch').value,
    section: document.getElementById('section').value,
    year: document.getElementById('year').value,
    semester: Number(document.getElementById('semester').value)
  };
  const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
  const okBanner = document.getElementById('okBanner');
  if (error) {
    toast('Failed to save changes');
  } else {
    okBanner.textContent = 'Profile updated successfully.';
    okBanner.style.display = 'block';
    setTimeout(() => okBanner.style.display = 'none', 3000);
    await loadProfile();
  }
  btn.disabled = false; btn.textContent = 'Save Changes';
});
