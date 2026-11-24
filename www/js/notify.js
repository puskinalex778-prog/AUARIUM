// Дружелюбные локальные push-уведомления для Android (через @capacitor/local-notifications).
// В браузере аккуратно ничего не делает; никогда не использует чувство вины или угрозы.
import { SPECIES } from './data.js';
import { allFish } from './save.js';

const NOTIF_IDS = [101, 102, 103, 104, 105];

function plugin() {
  return window.Capacitor?.Plugins?.LocalNotifications || null;
}

export async function requestNotifPermission() {
  const LN = plugin();
  if (!LN) return false;
  try {
    const cur = await LN.checkPermissions();
    if (cur?.display === 'granted') return true;
    const res = await LN.requestPermissions();
    return res?.display === 'granted';
  } catch {
    return false;
  }
}

export async function clearNotifications() {
  const LN = plugin();
  if (!LN) return;
  try {
    await LN.cancel({ notifications: NOTIF_IDS.map(id => ({ id })) });
  } catch { /* ignore */ }
}

export async function scheduleNotifications(state) {
  const LN = plugin();
  if (!LN || !state?.introDone) return;
  await clearNotifications();
  if (state.settings?.notifications === false) return;

  try {
    const perm = await LN.checkPermissions();
    if (perm?.display !== 'granted') return;

    const pets = allFish(state);
    if (!pets.length) return;
    const sample = pets[Math.floor(Math.random() * pets.length)];
    const petName = sample.name || SPECIES[sample.species]?.name || 'Питомцы';
    const now = Date.now();
    const list = [];

    // 1. Через 6 часов — приглашение покормить
    list.push({
      id: 101,
      title: '🐠 Питомцы ждут угощение!',
      body: pets.length > 1
        ? `${petName} и друзья уже поглядывают вверх — пора насыпать немного корма.`
        : `${petName} уже плавает у поверхности и ждёт вкусный корм.`,
      schedule: { at: new Date(now + 6 * 3600000) },
    });

    // 2. Через 18 часов — ежедневная награда и проверка воды
    list.push({
      id: 102,
      title: '⭐ Новая дневная награда в аквариуме',
      body: 'Загляни проверить воду и покормить питомцев — в «Заданиях» ждут монетки!',
      schedule: { at: new Date(now + 18 * 3600000) },
    });

    // 3. Через 36 часов — мягкое напоминание об уборке
    list.push({
      id: 103,
      title: '🧽 Пора навести уют в аквариуме',
      body: 'На стекле мог появиться лёгкий налёт — минутка с губкой сделает воду кристальной.',
      schedule: { at: new Date(now + 36 * 3600000) },
    });

    // 4. Через 3 дня — тёплое приглашение без чувства вины
    list.push({
      id: 104,
      title: '🌿 Как подросли твои питомцы?',
      body: `${petName} и весь аквариум спокойно ждут тебя. Загляни на минутку отдохнуть и полюбоваться!`,
      schedule: { at: new Date(now + 72 * 3600000) },
    });

    // 5. Особое уведомление о появлении мальков (если есть беременность или кладка икры)
    let nextBirth = Infinity;
    for (const tk of Object.values(state.tanks || {})) {
      for (const f of tk.fish || []) {
        if (f.pregnantUntil && f.pregnantUntil > now + 60000) nextBirth = Math.min(nextBirth, f.pregnantUntil);
      }
      for (const cl of tk.clutches || []) {
        if (cl.hatchAt && cl.hatchAt > now + 60000) nextBirth = Math.min(nextBirth, cl.hatchAt);
      }
    }
    if (nextBirth < Infinity) {
      list.push({
        id: 105,
        title: '🍼 Ура! В аквариуме появились мальки!',
        body: 'Загляни познакомиться с малышами — их можно пересадить в выростной отсек.',
        schedule: { at: new Date(nextBirth + 15000) },
      });
    }

    await LN.schedule({ notifications: list });
  } catch { /* ignore on unsupported platforms */ }
}
