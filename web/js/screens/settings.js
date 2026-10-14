// Settings: the two things Mimic asks about you. Both stay in this browser.

import { el, prefs, toast } from '../dom.js';

export function settingsScreen() {
  const name = el('input', { class: 'field', value: prefs.get('name', ''), placeholder: 'Your name on leaderboards', maxlength: 24 });
  const weight = el('input', { class: 'field', type: 'number', min: 25, max: 250, step: 1, value: prefs.get('weightKg', 65) });
  const save = el('button', {
    class: 'btn primary',
    onclick: () => {
      const kg = Number(weight.value);
      if (!(kg >= 25 && kg <= 250)) { toast('Enter a body weight between 25 and 250 kg.', 'bad'); return; }
      prefs.set('name', name.value.trim().slice(0, 24) || 'Dancer');
      prefs.set('weightKg', Math.round(kg));
      toast('Saved.');
    },
  }, 'Save');
  return {
    node: el('div', { class: 'settings' },
      el('h1', {}, 'Settings'),
      el('label', {}, el('span', {}, 'Name'), name),
      el('label', {}, el('span', {}, 'Body weight (kg)'), weight,
        el('small', { class: 'muted' }, 'Used only to estimate calories. Stays on this device.')),
      save,
    ),
  };
}
