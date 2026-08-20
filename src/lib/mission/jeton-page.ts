import { prisma } from '@/lib/prisma';
import { MESSAGES_JETON_INVALIDE, resoudreToken, type TokenAction } from '@/lib/mission/tokens';
import { missionSelect, type MissionResume } from '@/lib/mission/queries';

/**
 * Prépare l'affichage d'une page de décision à partir d'un jeton.
 *
 * **Lecture seule** : aucun effet de bord n'est produit ici. Les scanners
 * d'e-mails préchargent les liens ; consommer le jeton sur un simple GET
 * validerait des ordres de mission à l'insu des Ressources Humaines.
 */
export type EtatPageJeton =
  | { valide: true; mission: MissionResume; token: string }
  | { valide: false; message: string };

export async function preparerPageJeton(
  token: string,
  actionAttendue: TokenAction,
): Promise<EtatPageJeton> {
  const resolution = await resoudreToken(prisma, token);

  if (!resolution.valide) {
    return { valide: false, message: MESSAGES_JETON_INVALIDE[resolution.motif] };
  }

  if (resolution.action !== actionAttendue) {
    return { valide: false, message: "Ce lien ne correspond pas à l'action demandée." };
  }

  const mission = await prisma.missionOrder.findUnique({
    where: { id: resolution.missionOrderId },
    select: missionSelect,
  });

  if (!mission) {
    return { valide: false, message: MESSAGES_JETON_INVALIDE.INTROUVABLE };
  }

  return { valide: true, mission, token };
}
