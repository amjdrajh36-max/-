import type { Player, RoleDefinition, RoleId, Team } from './types.ts';

export const MAX_PLAYERS = 15;

export const ROLES: Record<RoleId, RoleDefinition> = {
  MAFIA_BOSS: {
    id: 'MAFIA_BOSS',
    name: 'شيخ المافيا',
    team: 'MAFIA',
    count: 1,
    summary: 'قائد فريق المافيا والمنفذ الرئيسي للاغتيالات الليلية.',
    abilityDetail: 'يستطيع اختيار وقتل لاعب من فريق الصالحين كل ليلة.',
    hasNightAction: true,
  },
  MAFIA_MEMBER: {
    id: 'MAFIA_MEMBER',
    name: 'المافيا',
    team: 'MAFIA',
    count: 2,
    summary: 'عضو سري في عصابة المافيا يعمل على تضليل الصالحين.',
    abilityDetail: 'يعرف هوية بقية أعضاء المافيا ويشارك في النقاش والتصويت لتوجيه الشكوك نحو الصالحين.',
    hasNightAction: false,
  },
  MAFIA_SILENCER: {
    id: 'MAFIA_SILENCER',
    name: 'مافيا التسكيت',
    team: 'MAFIA',
    count: 1,
    summary: 'متخصص في تكميم الأفواه ومنع الأهداف من الدفاع عن أنفسهم.',
    abilityDetail: 'يستطيع إسكات لاعب واحد لجولة نهارية واحدة، ويمكنه إسكات أي دور دون استثناء.',
    hasNightAction: true,
  },
  RIGHTEOUS_SHEIKH: {
    id: 'RIGHTEOUS_SHEIKH',
    name: 'شيخ الصالحين',
    team: 'RIGHTEOUS',
    count: 1,
    summary: 'زعيم الصالحين صاحب الحصانة الاستثنائية أمام التصويت.',
    abilityDetail: 'إذا أصبح صاحب أعلى عدد من الأصوات ضده، يستطيع كشف هويته لسحب الأصوات عنه (لا تُستخدم في الجولة الأولى).',
    hasNightAction: false,
  },
  RIGHTEOUS_SNIPER: {
    id: 'RIGHTEOUS_SNIPER',
    name: 'قناص الصالحين',
    team: 'RIGHTEOUS',
    count: 1,
    summary: 'قناص دقيق يمتلك رصاصة واحدة قد تقلب موازين اللعبة.',
    abilityDetail: 'يمتلك طلقة واحدة طوال اللعبة: إذا أصاب رجل مافيا يخرج المافيا وحده، وإذا أصاب صالحاً يخرج الاثنان معاً.',
    hasNightAction: true,
  },
  RIGHTEOUS_MEDIC: {
    id: 'RIGHTEOUS_MEDIC',
    name: 'مسعف الصالحين',
    team: 'RIGHTEOUS',
    count: 1,
    summary: 'طبيب شجاع يحمي الأبرياء من غدر المافيا في الظلام.',
    abilityDetail: 'يستطيع علاج لاعب واحد كل جولة، بما في ذلك نفسه، مع إمكانية تكرار علاج الشخص نفسه في جولات مختلفة.',
    hasNightAction: true,
  },
  RIGHTEOUS_BOY: {
    id: 'RIGHTEOUS_BOY',
    name: 'الولد الصالح',
    team: 'RIGHTEOUS',
    count: 1,
    summary: 'فتى جريء لا يرحل عن الساحة وحده إذا سقط.',
    abilityDetail: 'إذا أصبح صاحب أعلى عدد من الأصوات ضده أو قتله شيخ المافيا، يخرج ويختار لاعباً واحداً ليخرج معه.',
    hasNightAction: false,
  },
  RIGHTEOUS_CITIZEN: {
    id: 'RIGHTEOUS_CITIZEN',
    name: 'صالح',
    team: 'RIGHTEOUS',
    count: 7,
    summary: 'مواطن شريف يعتمد على قوة الملاحظة وكشف التناقضات.',
    abilityDetail: 'لا يمتلك قدرة ليلية خاصة، لكنه يشارك في التحليل والنقاش والتصويت لإسقاط المافيا.',
    hasNightAction: false,
  },
};

export const ROLE_DECK: RoleId[] = [
  'MAFIA_BOSS',
  'MAFIA_MEMBER',
  'MAFIA_MEMBER',
  'MAFIA_SILENCER',
  'RIGHTEOUS_SHEIKH',
  'RIGHTEOUS_SNIPER',
  'RIGHTEOUS_MEDIC',
  'RIGHTEOUS_BOY',
  'RIGHTEOUS_CITIZEN',
  'RIGHTEOUS_CITIZEN',
  'RIGHTEOUS_CITIZEN',
  'RIGHTEOUS_CITIZEN',
  'RIGHTEOUS_CITIZEN',
  'RIGHTEOUS_CITIZEN',
  'RIGHTEOUS_CITIZEN',
];

export const AI_BOT_NAMES: string[] = [
  'طارق',
  'ليلى',
  'عمر',
  'نورة',
  'خالد',
  'سلمى',
  'فيصل',
  'ريم',
  'يوسف',
  'مها',
  'زياد',
  'هند',
  'سعد',
  'دلال',
  'ماجد',
  'شهد',
];

export function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function checkWinner(players: Player[]): { winner: Team | null; reason: string | null } {
  const aliveMafia = players.filter((p) => p.isAlive && p.team === 'MAFIA').length;
  const aliveRighteous = players.filter((p) => p.isAlive && p.team === 'RIGHTEOUS').length;

  if (aliveMafia === 0) {
    return {
      winner: 'RIGHTEOUS',
      reason: 'تم القضاء على جميع أفراد عصابة المافيا واستعادت المدينة أمنها.',
    };
  }

  if (aliveRighteous <= 3) {
    return {
      winner: 'MAFIA',
      reason: 'سيطرت المافيا على المدينة بعد أن تبقّى ثلاثة من الصالحين فقط.',
    };
  }

  return { winner: null, reason: null };
}

export function getTeamLabel(team: Team): string {
  return team === 'MAFIA' ? 'فريق المافيا' : 'فريق الصالحين';
}
