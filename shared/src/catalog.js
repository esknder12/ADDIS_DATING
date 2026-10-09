/**
 * Dategram discovery catalog.
 *
 * In production this is backed by real, verified user rows. For the preview
 * experience we ship a small, owned (locally generated) set of demonstration
 * profiles so Discover, Likes, matches, chat, and gifts exercise the real
 * product logic end to end. Entries never hotlink external imagery
 * (implementation rule 12).
 */
export const memberCatalog = Object.freeze([
  {
    id: 'rodas',
    name: 'Rodas',
    emoji: '🎀',
    age: 19,
    city: 'Addis Ababa',
    country: 'Ethiopia',
    distanceKm: 2,
    bio: 'Architecture student. Sunday coffee rituals, long walks around Kazanchis, and conversations that skip the small talk.',
    intention: 'Serious relationship',
    interests: ['Coffee', 'Design', 'Jazz nights', 'Museums'],
    photo: '/images/profiles/p01.jpg',
    verified: true,
    likesYou: true,
    likesYouBack: true,
    replies: [
      'Hey! Your profile made me smile 🙂 How’s your week going?',
      'I’m usually up for coffee around Bole on the weekend ☕',
      'That actually sounds like a great first date idea.',
    ],
  },
  {
    id: 'hiwot',
    name: 'Hiwot',
    emoji: '🌸',
    age: 24,
    city: 'Addis Ababa',
    country: 'Ethiopia',
    distanceKm: 4,
    bio: 'Nurse, amateur photographer. Looking for something real — patience, honesty, and someone who laughs easily.',
    intention: 'Serious relationship',
    interests: ['Photography', 'Hiking', 'Cooking', 'Books'],
    photo: '/images/profiles/p02.jpg',
    verified: true,
    likesYou: true,
    likesYouBack: false,
    replies: [
      'Hi! I love your taste in music 😊',
      'Work was long today, tell me something fun?',
    ],
  },
  {
    id: 'meron',
    name: 'Meron',
    emoji: '✨',
    age: 26,
    city: 'Addis Ababa',
    country: 'Ethiopia',
    distanceKm: 6,
    bio: 'Product designer by day, injera perfectionist by night. Here for intention, not endless chats.',
    intention: 'Dating & seeing where it goes',
    interests: ['Art', 'Brunch', 'Running', 'Film'],
    photo: '/images/profiles/p03.jpg',
    verified: false,
    likesYou: false,
    likesYouBack: true,
    replies: [
      'Okay, your answers impressed me 😄',
      'Would you rather a gallery date or a cooking date?',
    ],
  },
  {
    id: 'selam',
    name: 'Selam',
    emoji: '🌙',
    age: 23,
    city: 'Addis Ababa',
    country: 'Ethiopia',
    distanceKm: 3,
    bio: 'Med student. Quiet bars over loud clubs, deep playlists, and people who keep their word.',
    intention: 'Serious relationship',
    interests: ['Medicine', 'Poetry', 'Swimming', 'Tea'],
    photo: '/images/profiles/p04.jpg',
    verified: true,
    likesYou: true,
    likesYouBack: true,
    replies: [
      'Hello! Finally someone who also picked slow mornings ☀️',
      'I study most evenings, but Sunday afternoons are sacred ☕',
    ],
  },
  {
    id: 'bethelhem',
    name: 'Betelhem',
    emoji: '🌺',
    age: 28,
    city: 'Addis Ababa',
    country: 'Ethiopia',
    distanceKm: 8,
    bio: 'Lawyer. Direct, warm, and allergic to ghosting. If you can make me laugh, we’re already halfway there.',
    intention: 'Dating & seeing where it goes',
    interests: ['Debate', 'Travel', 'Yoga', 'Street food'],
    photo: '/images/profiles/p05.jpg',
    verified: false,
    likesYou: false,
    likesYouBack: false,
    replies: ['Hey 🙂 tell me something your friends love about you.'],
  },
  {
    id: 'mahlet',
    name: 'Mahlet',
    emoji: '🎧',
    age: 25,
    city: 'Addis Ababa',
    country: 'Ethiopia',
    distanceKm: 5,
    bio: 'DJ on weekends, accountant on weekdays. Looking for my plus-one for concerts and quiet dinners both.',
    intention: 'Online communication',
    interests: ['Music', 'Concerts', 'Sneakers', 'Photography'],
    photo: '/images/profiles/p06.jpg',
    verified: true,
    likesYou: false,
    likesYouBack: true,
    replies: [
      'Heyy! Your profile has good energy 🎶',
      'I’m playing a set this Friday, no pressure but it’ll be fun 😄',
    ],
  },
  {
    id: 'tsion',
    name: 'Tsion',
    emoji: '📚',
    age: 27,
    city: 'Addis Ababa',
    country: 'Ethiopia',
    distanceKm: 7,
    bio: 'Teacher and bookshop regular. Believe in slow dating: good conversation first, everything else follows.',
    intention: 'Serious relationship',
    interests: ['Reading', 'Gardening', 'Theater', 'Baking'],
    photo: '/images/profiles/p07.jpg',
    verified: true,
    likesYou: true,
    likesYouBack: false,
    replies: ['Hi! What book would you give everyone you meet?'],
  },
  {
    id: 'liya',
    name: 'Liya',
    emoji: '🏃‍♀️',
    age: 22,
    city: 'Addis Ababa',
    country: 'Ethiopia',
    distanceKm: 1,
    bio: 'Runner, early riser, sunshine collector. Here to meet someone kind who shows up when they say they will.',
    intention: 'Dating & seeing where it goes',
    interests: ['Running', 'Nutrition', 'Podcasts', 'Dogs'],
    photo: '/images/profiles/p08.jpg',
    verified: false,
    likesYou: false,
    likesYouBack: true,
    replies: [
      'Hi! Morning run buddy application accepted? 😄',
      'I do 5k around Meskel Square most Saturdays 🏃‍♀️',
    ],
  },
]);

export const memberById = new Map(memberCatalog.map((member) => [member.id, member]));

export function getMember(profileId) {
  return memberById.get(profileId) || null;
}

export const giftCatalog = Object.freeze([
  { id: 'rose', label: 'Rose', icon: '🌹', stars: 31 },
  { id: 'ring', label: 'Ring', icon: '💍', stars: 125 },
  { id: 'diamond', label: 'Diamond', icon: '💎', stars: 125 },
]);

export const giftById = new Map(giftCatalog.map((gift) => [gift.id, gift]));

export const vipPlans = Object.freeze([
  { id: 'weekly', label: '1 Week', weeks: 1, basePriceStars: 95, perk: 'Try VIP out' },
  { id: 'monthly', label: '1 Month', weeks: 4, basePriceStars: 249, perk: 'Most popular' },
  { id: 'quarterly', label: '3 Months', weeks: 12, basePriceStars: 549, perk: 'Best value' },
]);

export const vipPlanById = new Map(vipPlans.map((plan) => [plan.id, plan]));

/** Deterministic shuffle so daily AI Picks feel curated without server work. */
export function seededOrder(items, seedText) {
  let seed = 0;
  for (const char of String(seedText)) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  const ordered = [...items];
  for (let index = ordered.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const swapIndex = seed % (index + 1);
    [ordered[index], ordered[swapIndex]] = [ordered[swapIndex], ordered[index]];
  }
  return ordered;
}

export function dailyAiPicks(seedText, count = 4) {
  const today = new Date().toISOString().slice(0, 10);
  return seededOrder(memberCatalog, `${seedText}:${today}:ai-picks`).slice(0, count);
}
