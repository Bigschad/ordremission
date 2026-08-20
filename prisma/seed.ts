/**
 * Jeu de données de démonstration.
 *
 * Exécution : `pnpm db:seed`
 * Le script est idempotent : il vide les ordres de mission et l'audit, puis
 * réinsère un jeu complet. Les utilisateurs sont créés en `upsert`.
 */
import { MissionStatus, PrismaClient, Role, TransportType } from '@prisma/client';
import { fromZonedTime } from 'date-fns-tz';

const prisma = new PrismaClient();

const TIMEZONE = 'Africa/Abidjan';

/** « 2026-08-19T13:00 » (heure d'Abidjan) → instant UTC. */
function abidjan(local: string): Date {
  return fromZonedTime(local, TIMEZONE);
}

function joursDepuisMaintenant(jours: number, heure: string): Date {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + jours);
  const iso = base.toISOString().slice(0, 10);
  return abidjan(`${iso}T${heure}`);
}

interface SeedUser {
  nom: string;
  prenoms: string;
  matricule: string;
  fonction: string;
  email: string;
  role: Role;
  actif?: boolean;
}

const UTILISATEURS: SeedUser[] = [
  {
    nom: 'KOUASSI',
    prenoms: 'ADAMA',
    matricule: '1001',
    fonction: 'Administrateur Système',
    email: 'admin@porteo-group.com',
    role: Role.ADMIN,
  },
  {
    nom: 'DIALLO',
    prenoms: 'FATOUMATA',
    matricule: '2001',
    fonction: 'Responsable Ressources Humaines',
    email: 'rh@porteo-group.com',
    role: Role.HR,
  },
  {
    nom: 'TRAORE',
    prenoms: 'IBRAHIM',
    matricule: '2002',
    fonction: 'Gestionnaire Ressources Humaines',
    email: 'rh2@porteo-group.com',
    role: Role.HR,
  },
  {
    // Collaborateur de référence — reprend la fiche papier d'origine.
    nom: 'YEYE',
    prenoms: 'SCHADRACH GUY-ROLAND',
    matricule: '4071',
    fonction: 'Responsable Développement & Intégration IT',
    email: 'schadrach.yeye@porteo-group.com',
    role: Role.EMPLOYEE,
  },
  {
    nom: 'BAMBA',
    prenoms: 'AWA',
    matricule: '4072',
    fonction: 'Conductrice de Travaux',
    email: 'awa.bamba@porteo-group.com',
    role: Role.EMPLOYEE,
  },
  {
    nom: 'KONE',
    prenoms: 'MAMADOU',
    matricule: '4073',
    fonction: 'Ingénieur Génie Civil',
    email: 'mamadou.kone@porteo-group.com',
    role: Role.EMPLOYEE,
  },
  {
    nom: "N'GUESSAN",
    prenoms: 'ARIANE',
    matricule: '4074',
    fonction: 'Chargée des Achats',
    email: 'ariane.nguessan@porteo-group.com',
    role: Role.EMPLOYEE,
  },
  {
    nom: 'OUATTARA',
    prenoms: 'SEYDOU',
    matricule: '4075',
    fonction: 'Chef de Parc Automobile',
    email: 'seydou.ouattara@porteo-group.com',
    role: Role.EMPLOYEE,
  },
  {
    nom: 'ZADI',
    prenoms: 'CHRISTELLE',
    matricule: '4076',
    fonction: 'Contrôleuse de Gestion',
    email: 'christelle.zadi@porteo-group.com',
    role: Role.EMPLOYEE,
    actif: false,
  },
];

interface SeedMission {
  emailDemandeur: string;
  analytique?: string;
  objet: string;
  lieu: string;
  dateDepart: Date;
  dateRetour: Date;
  transportType: TransportType;
  transportDetail?: string;
  litresGasoil?: number;
  status: MissionStatus;
  motifRefus?: string;
}

const ANNEE = new Date().getUTCFullYear();

const MISSIONS: SeedMission[] = [
  // ---- La fiche d'origine, reproduite fidèlement -------------------------
  {
    emailDemandeur: 'schadrach.yeye@porteo-group.com',
    analytique: 'IT-2026-001',
    objet: 'Visite chantier',
    lieu: 'Assinie',
    dateDepart: abidjan('2026-08-19T13:00'),
    dateRetour: abidjan('2026-08-19T17:00'),
    transportType: TransportType.VEHICULE_ETABLISSEMENT,
    transportDetail: '1234 AB 01',
    litresGasoil: 40,
    status: MissionStatus.APPROVED,
  },
  // ---- Validés ----------------------------------------------------------
  {
    emailDemandeur: 'awa.bamba@porteo-group.com',
    analytique: 'BTP-2026-114',
    objet: 'Réception de travaux de voirie',
    lieu: 'Yamoussoukro',
    dateDepart: joursDepuisMaintenant(-12, '06:30'),
    dateRetour: joursDepuisMaintenant(-11, '19:00'),
    transportType: TransportType.VEHICULE_ETABLISSEMENT,
    transportDetail: '5566 CD 01',
    litresGasoil: 85.5,
    status: MissionStatus.APPROVED,
  },
  {
    emailDemandeur: 'mamadou.kone@porteo-group.com',
    objet: 'Étude géotechnique préalable',
    lieu: 'Bouaké',
    dateDepart: joursDepuisMaintenant(-8, '07:00'),
    dateRetour: joursDepuisMaintenant(-6, '18:30'),
    transportType: TransportType.VEHICULE_LOCATION,
    transportDetail: 'Loueur Ivoire Auto Services',
    litresGasoil: 120,
    status: MissionStatus.APPROVED,
  },
  // ---- En attente de validation ------------------------------------------
  {
    emailDemandeur: 'schadrach.yeye@porteo-group.com',
    analytique: 'IT-2026-007',
    objet: 'Déploiement du réseau de la base vie',
    lieu: 'San-Pédro',
    dateDepart: joursDepuisMaintenant(6, '05:45'),
    dateRetour: joursDepuisMaintenant(8, '20:00'),
    transportType: TransportType.VEHICULE_PERSONNEL,
    transportDetail: '9012 EF 01',
    litresGasoil: 95,
    status: MissionStatus.SUBMITTED,
  },
  {
    emailDemandeur: 'ariane.nguessan@porteo-group.com',
    analytique: 'ACH-2026-042',
    objet: 'Audit fournisseur matériaux',
    lieu: 'Abengourou',
    dateDepart: joursDepuisMaintenant(3, '08:00'),
    dateRetour: joursDepuisMaintenant(3, '18:00'),
    transportType: TransportType.TRANSPORT_EN_COMMUN,
    transportDetail: 'Compagnie UTB — ligne Abidjan/Abengourou',
    status: MissionStatus.SUBMITTED,
  },
  {
    emailDemandeur: 'seydou.ouattara@porteo-group.com',
    objet: 'Convoyage de deux engins de chantier',
    lieu: 'Korhogo',
    dateDepart: joursDepuisMaintenant(10, '04:00'),
    dateRetour: joursDepuisMaintenant(12, '21:00'),
    transportType: TransportType.VEHICULE_ETABLISSEMENT,
    transportDetail: '7788 GH 01',
    litresGasoil: 210.75,
    status: MissionStatus.SUBMITTED,
  },
  // ---- Refusés ------------------------------------------------------------
  {
    emailDemandeur: 'mamadou.kone@porteo-group.com',
    objet: 'Salon professionnel du BTP',
    lieu: 'Grand-Bassam',
    dateDepart: joursDepuisMaintenant(-4, '09:00'),
    dateRetour: joursDepuisMaintenant(-4, '17:00'),
    transportType: TransportType.VEHICULE_PERSONNEL,
    transportDetail: '3344 IJ 01',
    litresGasoil: 25,
    status: MissionStatus.REJECTED,
    motifRefus:
      "Budget déplacement du service déjà consommé pour le mois. À représenter au mois prochain avec l'accord du contrôle de gestion.",
  },
  {
    emailDemandeur: 'awa.bamba@porteo-group.com',
    objet: 'Visite de courtoisie sur le site client',
    lieu: 'Daloa',
    dateDepart: joursDepuisMaintenant(-2, '10:00'),
    dateRetour: joursDepuisMaintenant(-2, '16:00'),
    transportType: TransportType.VEHICULE_LOCATION,
    transportDetail: 'Loueur Sahel Location',
    litresGasoil: 60,
    status: MissionStatus.REJECTED,
    motifRefus:
      "Objet de la mission insuffisamment justifié. Merci de préciser les livrables attendus et l'interlocuteur rencontré.",
  },
  // ---- Brouillons ---------------------------------------------------------
  {
    emailDemandeur: 'schadrach.yeye@porteo-group.com',
    analytique: 'IT-2026-011',
    objet: 'Maintenance des serveurs de l’agence',
    lieu: 'Man',
    dateDepart: joursDepuisMaintenant(20, '06:00'),
    dateRetour: joursDepuisMaintenant(22, '19:00'),
    transportType: TransportType.VEHICULE_ETABLISSEMENT,
    transportDetail: '1234 AB 01',
    litresGasoil: 150,
    status: MissionStatus.DRAFT,
  },
  {
    emailDemandeur: 'ariane.nguessan@porteo-group.com',
    objet: 'Négociation cadre avec un transporteur',
    lieu: 'Bondoukou',
    dateDepart: joursDepuisMaintenant(15, '07:30'),
    dateRetour: joursDepuisMaintenant(16, '18:00'),
    transportType: TransportType.TRANSPORT_EN_COMMUN,
    status: MissionStatus.DRAFT,
  },
  {
    emailDemandeur: 'seydou.ouattara@porteo-group.com',
    objet: 'Contrôle technique de la flotte',
    lieu: 'Abidjan — Yopougon',
    dateDepart: joursDepuisMaintenant(5, '08:00'),
    dateRetour: joursDepuisMaintenant(5, '12:00'),
    transportType: TransportType.VEHICULE_ETABLISSEMENT,
    transportDetail: '7788 GH 01',
    litresGasoil: 15,
    status: MissionStatus.DRAFT,
  },
  // ---- Annulé -------------------------------------------------------------
  {
    emailDemandeur: 'mamadou.kone@porteo-group.com',
    objet: 'Réunion de coordination régionale',
    lieu: 'Gagnoa',
    dateDepart: joursDepuisMaintenant(-1, '08:00'),
    dateRetour: joursDepuisMaintenant(-1, '17:00'),
    transportType: TransportType.VEHICULE_ETABLISSEMENT,
    transportDetail: '5566 CD 01',
    litresGasoil: 55,
    status: MissionStatus.CANCELLED,
  },
];

function numeroProvisoire(index: number): string {
  return `BROUILLON-SEED-${String(index).padStart(4, '0')}`;
}

async function main(): Promise<void> {
  console.log('→ Nettoyage des données de démonstration…');
  await prisma.approvalToken.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.missionOrder.deleteMany();
  await prisma.counter.deleteMany();
  await prisma.rateLimit.deleteMany();

  console.log('→ Création des utilisateurs…');
  for (const utilisateur of UTILISATEURS) {
    await prisma.user.upsert({
      where: { email: utilisateur.email },
      update: {
        nom: utilisateur.nom,
        prenoms: utilisateur.prenoms,
        matricule: utilisateur.matricule,
        fonction: utilisateur.fonction,
        role: utilisateur.role,
        actif: utilisateur.actif ?? true,
      },
      create: {
        nom: utilisateur.nom,
        prenoms: utilisateur.prenoms,
        matricule: utilisateur.matricule,
        fonction: utilisateur.fonction,
        email: utilisateur.email,
        role: utilisateur.role,
        actif: utilisateur.actif ?? true,
        emailVerified: new Date(),
      },
    });
  }
  console.log(`   ${UTILISATEURS.length} utilisateurs (1 admin, 2 RH, 6 collaborateurs).`);

  const valideur = await prisma.user.findUniqueOrThrow({
    where: { email: 'rh@porteo-group.com' },
  });

  console.log('→ Création des ordres de mission…');
  let sequence = 0;

  for (const [index, mission] of MISSIONS.entries()) {
    const demandeur = await prisma.user.findUniqueOrThrow({
      where: { email: mission.emailDemandeur },
    });

    // Le numéro définitif n'est attribué qu'à partir de la soumission.
    const estSoumis = mission.status !== MissionStatus.DRAFT;
    let numero = numeroProvisoire(index);
    if (estSoumis) {
      sequence += 1;
      numero = `OM-${ANNEE}-${String(sequence).padStart(4, '0')}`;
    }

    const submittedAt = estSoumis ? new Date(mission.dateDepart.getTime() - 5 * 86400000) : null;
    const aDecision =
      mission.status === MissionStatus.APPROVED || mission.status === MissionStatus.REJECTED;
    const decidedAt = aDecision ? new Date((submittedAt ?? new Date()).getTime() + 86400000) : null;

    const ordre = await prisma.missionOrder.create({
      data: {
        numero,
        demandeurId: demandeur.id,
        nom: demandeur.nom,
        prenoms: demandeur.prenoms,
        matricule: demandeur.matricule,
        fonction: demandeur.fonction,
        analytique: mission.analytique ?? null,
        objet: mission.objet,
        lieu: mission.lieu,
        dateDepart: mission.dateDepart,
        dateRetour: mission.dateRetour,
        transportType: mission.transportType,
        transportDetail: mission.transportDetail ?? null,
        litresGasoil: mission.litresGasoil ?? null,
        status: mission.status,
        motifRefus: mission.motifRefus ?? null,
        submittedAt,
        decidedAt,
        decidedById: aDecision ? valideur.id : null,
        decidedByName: aDecision ? `${valideur.prenoms} ${valideur.nom}` : null,
        decidedByEmail: aDecision ? valideur.email : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        entite: 'MissionOrder',
        entiteId: ordre.id,
        action: 'CREATED',
        acteur: demandeur.email,
        details: { source: 'seed' },
      },
    });

    if (estSoumis) {
      await prisma.auditLog.create({
        data: {
          entite: 'MissionOrder',
          entiteId: ordre.id,
          action: 'SUBMITTED',
          acteur: demandeur.email,
          details: { numero: ordre.numero },
        },
      });
    }

    if (aDecision) {
      await prisma.auditLog.create({
        data: {
          entite: 'MissionOrder',
          entiteId: ordre.id,
          action: mission.status === MissionStatus.APPROVED ? 'APPROVED' : 'REJECTED',
          acteur: valideur.email,
          details: mission.motifRefus ? { motif: mission.motifRefus } : {},
        },
      });
    }

    if (mission.status === MissionStatus.CANCELLED) {
      await prisma.auditLog.create({
        data: {
          entite: 'MissionOrder',
          entiteId: ordre.id,
          action: 'CANCELLED',
          acteur: demandeur.email,
        },
      });
    }
  }

  // Le compteur reflète les numéros déjà attribués.
  await prisma.counter.upsert({
    where: { annee: ANNEE },
    update: { sequence },
    create: { annee: ANNEE, sequence },
  });

  console.log(`   ${MISSIONS.length} ordres de mission, dont ${sequence} numérotés.`);
  console.log('✓ Jeu de données de démonstration installé.');
  console.log('  Connexion de démonstration : schadrach.yeye@porteo-group.com (collaborateur)');
  console.log('                               rh@porteo-group.com (Ressources Humaines)');
  console.log('                               admin@porteo-group.com (administrateur)');
}

main()
  .catch((error: unknown) => {
    console.error('✗ Échec du seed :', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
