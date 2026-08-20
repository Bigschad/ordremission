import { TransportType } from '@prisma/client';
import { z } from 'zod';
import { TIMEZONE, zonedToUtc } from '@/lib/dates';

/**
 * Validations partagées client/serveur des ordres de mission.
 * Chaque règle de la section « Règles métier » du cahier des charges est
 * implémentée ici et couverte par un test unitaire.
 */

/** Règle 2 — garde-fous de saisie rétroactive / trop lointaine. */
export const RETROACTIVITE_MAX_JOURS = 30;
export const ANTICIPATION_MAX_MOIS = 12;

/** Règle 8 — un refus exige un motif d'au moins 10 caractères. */
export const MOTIF_REFUS_MIN = 10;
export const MOTIF_REFUS_MAX = 1000;

/** Règle 3 — transports pour lesquels une quantité de gasoil est saisissable. */
export const TRANSPORTS_AVEC_GASOIL: readonly TransportType[] = [
  TransportType.VEHICULE_ETABLISSEMENT,
  TransportType.VEHICULE_PERSONNEL,
  TransportType.VEHICULE_LOCATION,
];

/** Règle 4 — transports pour lesquels le détail est obligatoire. */
export const TRANSPORTS_AVEC_DETAIL_OBLIGATOIRE: readonly TransportType[] = [
  TransportType.VEHICULE_LOCATION,
  TransportType.VEHICULE_PERSONNEL,
];

export function accepteGasoil(transportType: TransportType): boolean {
  return TRANSPORTS_AVEC_GASOIL.includes(transportType);
}

export function exigeDetail(transportType: TransportType): boolean {
  return TRANSPORTS_AVEC_DETAIL_OBLIGATOIRE.includes(transportType);
}

export const TRANSPORT_LABELS: Record<TransportType, string> = {
  VEHICULE_ETABLISSEMENT: "Véhicule de l'établissement",
  VEHICULE_PERSONNEL: 'Véhicule personnel',
  VEHICULE_LOCATION: 'Véhicule de location',
  TRANSPORT_EN_COMMUN: 'Transport en commun',
};

/** Libellé du champ « détail », dépendant du moyen de transport. */
export const TRANSPORT_DETAIL_LABELS: Record<TransportType, string> = {
  VEHICULE_ETABLISSEMENT: 'Immatriculation du véhicule (facultatif)',
  VEHICULE_PERSONNEL: 'Immatriculation du véhicule',
  VEHICULE_LOCATION: 'Nom du loueur',
  TRANSPORT_EN_COMMUN: 'Ligne ou compagnie (facultatif)',
};

/**
 * Une saisie `datetime-local` : « 2026-08-19T13:00 ».
 * Interprétée dans le fuseau Africa/Abidjan puis stockée en UTC.
 */
const datetimeLocalSchema = z
  .string()
  .min(1, 'Ce champ est obligatoire')
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, 'Date ou heure invalide')
  .transform((value) => zonedToUtc(value.length === 16 ? `${value}:00` : value))
  .refine((date) => !Number.isNaN(date.getTime()), { message: 'Date ou heure invalide' });

const texteObligatoire = (champ: string, max = 200) =>
  z
    .string({ required_error: `${champ} est obligatoire` })
    .trim()
    .min(1, `${champ} est obligatoire`)
    .max(max, `${champ} ne peut pas dépasser ${max} caractères`);

/**
 * `litresGasoil` arrive du formulaire sous forme de chaîne (champ vide = null).
 * Decimal(6,2) ⇒ 4 chiffres avant la virgule, 2 après.
 */
const litresGasoilSchema = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      const nettoye = value.trim().replace(',', '.');
      if (nettoye === '') return null;
      const nombre = Number(nettoye);
      return Number.isNaN(nombre) ? Number.NaN : nombre;
    }
    return value;
  })
  .refine((value) => value === null || !Number.isNaN(value), {
    message: 'Quantité de gasoil invalide',
  })
  .refine((value) => value === null || value >= 0, {
    message: 'La quantité de gasoil ne peut pas être négative',
  })
  .refine((value) => value === null || value <= 9999.99, {
    message: 'La quantité de gasoil ne peut pas dépasser 9 999,99 litres',
  })
  .refine((value) => value === null || Number.isInteger(Math.round(value * 100)), {
    message: 'La quantité de gasoil admet au maximum deux décimales',
  });

/** Champs bruts du formulaire, avant application des règles croisées. */
const missionBaseSchema = z.object({
  analytique: z
    .string()
    .trim()
    .max(50, 'Le code analytique ne peut pas dépasser 50 caractères')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  objet: texteObligatoire('L’objet de la mission', 300),
  lieu: texteObligatoire('Le lieu de la mission', 200),
  dateDepart: datetimeLocalSchema,
  dateRetour: datetimeLocalSchema,
  transportType: z.nativeEnum(TransportType, {
    required_error: 'Le moyen de transport est obligatoire',
    invalid_type_error: 'Moyen de transport inconnu',
  }),
  transportDetail: z
    .string()
    .trim()
    .max(200, 'Le détail du transport ne peut pas dépasser 200 caractères')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  litresGasoil: litresGasoilSchema,
});

export type MissionInput = z.input<typeof missionBaseSchema>;
export type MissionData = z.output<typeof missionSchema>;

/**
 * Applique les règles croisées 1 à 4.
 * `maintenant` est injectable pour rendre les tests déterministes.
 */
function appliquerReglesMetier(
  schema: typeof missionBaseSchema,
  maintenant: () => Date = () => new Date(),
) {
  return schema.superRefine((data, ctx) => {
    // Règle 1 — la date de retour doit être strictement postérieure au départ.
    if (data.dateRetour.getTime() <= data.dateDepart.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dateRetour'],
        message: 'La date de retour doit être postérieure à la date de départ',
      });
    }

    // Règle 2 — bornes de rétroactivité et d'anticipation.
    const now = maintenant();
    const borneBasse = new Date(now.getTime() - RETROACTIVITE_MAX_JOURS * 24 * 60 * 60 * 1000);
    const borneHaute = new Date(now);
    borneHaute.setUTCMonth(borneHaute.getUTCMonth() + ANTICIPATION_MAX_MOIS);

    if (data.dateDepart.getTime() < borneBasse.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dateDepart'],
        message: `La date de départ ne peut pas précéder de plus de ${RETROACTIVITE_MAX_JOURS} jours la date du jour`,
      });
    }

    if (data.dateDepart.getTime() > borneHaute.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dateDepart'],
        message: `La date de départ ne peut pas dépasser ${ANTICIPATION_MAX_MOIS} mois dans le futur`,
      });
    }

    // Règle 3 — gasoil interdit pour le transport en commun.
    if (data.litresGasoil !== null && !accepteGasoil(data.transportType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['litresGasoil'],
        message:
          'Aucune quantité de gasoil ne peut être saisie pour un déplacement en transport en commun',
      });
    }

    // Règle 4 — détail obligatoire pour véhicule personnel et véhicule de location.
    if (exigeDetail(data.transportType) && !data.transportDetail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['transportDetail'],
        message:
          data.transportType === TransportType.VEHICULE_LOCATION
            ? 'Le nom du loueur est obligatoire'
            : "L'immatriculation du véhicule est obligatoire",
      });
    }
  });
}

/** Schéma de référence, utilisé par le formulaire et par les Server Actions. */
export const missionSchema = appliquerReglesMetier(missionBaseSchema);

/**
 * Variante injectant une horloge : indispensable aux tests de la règle 2.
 * @internal
 */
export function creerMissionSchema(maintenant: () => Date) {
  return appliquerReglesMetier(missionBaseSchema, maintenant);
}

/**
 * Un brouillon ne valide que le format des champs, sans les règles croisées :
 * on doit pouvoir enregistrer une saisie incomplète et y revenir plus tard.
 */
export const missionBrouillonSchema = missionBaseSchema.partial({
  objet: true,
  lieu: true,
  dateDepart: true,
  dateRetour: true,
  transportType: true,
});

export type MissionBrouillonData = z.output<typeof missionBrouillonSchema>;

/** Règle 8 — motif de refus obligatoire. */
export const refusSchema = z.object({
  motif: z
    .string({ required_error: 'Le motif du refus est obligatoire' })
    .trim()
    .min(MOTIF_REFUS_MIN, `Le motif du refus doit comporter au moins ${MOTIF_REFUS_MIN} caractères`)
    .max(MOTIF_REFUS_MAX, `Le motif du refus ne peut pas dépasser ${MOTIF_REFUS_MAX} caractères`),
});

export type RefusData = z.infer<typeof refusSchema>;

export { TIMEZONE };
