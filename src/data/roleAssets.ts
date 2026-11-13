import { RoleId } from '../shared/types';
import heroTableImg from '../assets/images/mafia_hero_table_1794446901130.jpg';
import roleMafiaBossImg from '../assets/images/role_mafia_boss_1794446899761.jpg';
import roleMafiaMemberImg from '../assets/images/role_mafia_member_1794456042631.jpg';
import roleSilencerImg from '../assets/images/role_silencer_1794456041845.jpg';
import roleSheikhImg from '../assets/images/role_sheikh_1794446900991.jpg';
import roleSniperImg from '../assets/images/role_sniper_1794446900643.jpg';
import roleMedicImg from '../assets/images/role_medic_1794446900699.jpg';
import roleRighteousBoyImg from '../assets/images/role_righteous_boy_1794456043548.jpg';
import roleCitizenImg from '../assets/images/role_citizen_1794456043123.jpg';
import sceneNightCityImg from '../assets/images/scene_night_city_1794456262032.jpg';
import sceneDayCouncilImg from '../assets/images/scene_day_council_1794456262016.jpg';
import sceneVictoryRighteousImg from '../assets/images/scene_victory_righteous_1794456262755.jpg';
import sceneVictoryMafiaImg from '../assets/images/scene_victory_mafia_1794456262660.jpg';

export const HERO_TABLE_IMAGE = heroTableImg;

export const SCENE_IMAGES = {
  NIGHT: sceneNightCityImg,
  DAY: sceneDayCouncilImg,
  VICTORY_RIGHTEOUS: sceneVictoryRighteousImg,
  VICTORY_MAFIA: sceneVictoryMafiaImg,
} as const;

export const ROLE_IMAGES: Partial<Record<RoleId, string>> = {
  MAFIA_BOSS: roleMafiaBossImg,
  MAFIA_MEMBER: roleMafiaMemberImg,
  MAFIA_SILENCER: roleSilencerImg,
  RIGHTEOUS_SHEIKH: roleSheikhImg,
  RIGHTEOUS_SNIPER: roleSniperImg,
  RIGHTEOUS_MEDIC: roleMedicImg,
  RIGHTEOUS_BOY: roleRighteousBoyImg,
  RIGHTEOUS_CITIZEN: roleCitizenImg,
};

export function getRoleAccentClasses(roleId?: RoleId): {
  surface: string;
  text: string;
  border: string;
  gradient: string;
} {
  if (!roleId) {
    return {
      surface: 'bg-slate-800/60',
      text: 'text-slate-200',
      border: 'border-slate-700',
      gradient: 'from-slate-800 to-slate-950',
    };
  }
  if (roleId.startsWith('MAFIA')) {
    return {
      surface: 'bg-red-950/50',
      text: 'text-red-400',
      border: 'border-red-900/60',
      gradient: 'from-red-950 via-slate-900 to-black',
    };
  }
  if (roleId === 'RIGHTEOUS_MEDIC') {
    return {
      surface: 'bg-emerald-950/50',
      text: 'text-emerald-400',
      border: 'border-emerald-900/60',
      gradient: 'from-emerald-950 via-slate-900 to-black',
    };
  }
  return {
    surface: 'bg-amber-950/40',
    text: 'text-amber-400',
    border: 'border-amber-800/50',
    gradient: 'from-amber-950 via-slate-900 to-black',
  };
}
