import {
  Document,
  Image,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
} from '@react-pdf/renderer';
import { MissionStatus, type TransportType } from '@prisma/client';
import { formatDate, formatDateTime, formatTime } from '@/lib/dates';
import { estNumeroProvisoire } from '@/lib/mission/numero';

/**
 * Reproduction du formulaire papier « ORDRE DE MISSION EN COTE D'IVOIRE ».
 *
 * Les libellés, leur ordre et la mise en page suivent la fiche pré-imprimée :
 * le PDF doit pouvoir être superposé à l'original. Seule la ligne « N° » est
 * un ajout, rendu nécessaire par la dématérialisation.
 *
 * Contrainte technique : les polices intégrées de @react-pdf/renderer utilisent
 * l'encodage WinAnsi. Aucun caractère hors Latin-1 n'est employé — la croix des
 * cases à cocher est donc dessinée en SVG plutôt que rendue avec « ✗ ».
 */

const MARINE = '#1B2A4A';
const NOIR = '#111111';
const GRIS = '#666666';
const GRIS_CLAIR = '#AAAAAA';
const ROUGE = '#C0202A';

export interface DonneesPdf {
  numero: string;
  nom: string;
  prenoms: string;
  matricule: string;
  fonction: string;
  analytique: string | null;
  objet: string;
  lieu: string;
  dateDepart: Date;
  dateRetour: Date;
  transportType: TransportType;
  transportDetail: string | null;
  litresGasoil: string | null;
  status: MissionStatus;
  motifRefus: string | null;
  decidedAt: Date | null;
  decidedByName: string | null;
  createdAt: Date;
  /** Data URI du logo, `null` si le fichier n'a pas été déposé. */
  logo: string | null;
  /** Data URI du QR code de vérification. */
  qrCode: string;
  /** URL lisible imprimée sous le QR code. */
  urlVerification: string;
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    color: NOIR,
    fontFamily: 'Helvetica',
    fontSize: 9,
    paddingBottom: 92,
    paddingHorizontal: 38,
    paddingTop: 26,
  },

  // -- En-tête ------------------------------------------------------------
  entete: { alignItems: 'flex-start', flexDirection: 'row', marginBottom: 10 },
  logo: { height: 44, objectFit: 'contain', width: 122 },
  logoTexte: { flexDirection: 'column' },
  logoMarque: { color: MARINE, fontFamily: 'Helvetica-Bold', fontSize: 17, letterSpacing: 2.4 },
  logoSuite: { color: '#E8A33D', fontFamily: 'Helvetica-Bold', fontSize: 8, letterSpacing: 4.6 },

  titreBloc: { alignItems: 'center', marginBottom: 12, marginTop: 2 },
  titre: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 13,
    letterSpacing: 0.4,
    textDecoration: 'underline',
  },

  // -- Bandeau numéro / date ----------------------------------------------
  bandeauMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  metaLibelle: { fontFamily: 'Helvetica-Bold', fontSize: 9.5 },
  metaValeur: { fontSize: 9.5 },

  // -- Champs en pointillés -------------------------------------------------
  champ: { flexDirection: 'row', marginBottom: 9 },
  champLibelle: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, width: 132 },
  champSeparateur: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, width: 10 },
  champValeur: {
    borderBottomColor: GRIS,
    borderBottomStyle: 'dotted',
    borderBottomWidth: 1,
    flexGrow: 1,
    fontSize: 9.5,
    paddingBottom: 1.5,
  },

  // -- Transport -------------------------------------------------------------
  trait: { backgroundColor: NOIR, height: 1, marginBottom: 10, marginTop: 6 },
  phraseTransport: { fontFamily: 'Helvetica-Oblique', fontSize: 9.5, marginBottom: 9 },

  ligneCase: { alignItems: 'center', flexDirection: 'row', marginBottom: 7 },
  case: {
    borderColor: NOIR,
    borderWidth: 1,
    height: 11,
    marginRight: 7,
    width: 11,
  },
  caseLibelle: { fontSize: 9.5, width: 148 },
  caseDetail: {
    borderBottomColor: GRIS,
    borderBottomStyle: 'dotted',
    borderBottomWidth: 1,
    flexGrow: 1,
    fontSize: 9,
    paddingBottom: 1.5,
  },

  ligneGasoil: { alignItems: 'flex-end', flexDirection: 'row', marginBottom: 12, marginTop: 4 },
  gasoilValeur: {
    borderBottomColor: GRIS,
    borderBottomStyle: 'dotted',
    borderBottomWidth: 1,
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
    paddingBottom: 1.5,
    textAlign: 'center',
    width: 74,
  },
  gasoilLibelle: { fontSize: 9.5, marginLeft: 7 },

  // -- Tableaux ---------------------------------------------------------------
  tableau: { borderColor: NOIR, borderWidth: 1, flexDirection: 'row' },
  colonneSignature: {
    borderRightColor: NOIR,
    borderRightWidth: 1,
    flexBasis: 0,
    flexGrow: 1,
    minHeight: 92,
  },
  colonneSignatureFin: { borderRightWidth: 0 },
  enteteColonne: {
    borderBottomColor: NOIR,
    borderBottomWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 5,
  },
  enteteColonneTexte: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, textAlign: 'center' },
  corpsColonne: { flexGrow: 1, justifyContent: 'center', padding: 6 },

  mentionValidation: {
    color: '#1E7A46',
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    lineHeight: 1.35,
    textAlign: 'center',
  },
  mentionNumero: { color: GRIS, fontSize: 6.5, marginTop: 3, textAlign: 'center' },
  mentionRefus: {
    color: ROUGE,
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    lineHeight: 1.35,
    textAlign: 'center',
  },
  motifRefus: { color: ROUGE, fontSize: 6.5, marginTop: 3, textAlign: 'center' },

  titreSecurite: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
    marginBottom: 5,
    marginTop: 16,
  },
  sousTitreSecurite: { color: GRIS, fontFamily: 'Helvetica-Oblique', fontSize: 8, marginBottom: 6 },
  colonneSecurite: {
    borderRightColor: NOIR,
    borderRightWidth: 1,
    flexBasis: 0,
    flexGrow: 1,
    minHeight: 56,
  },

  // -- Filigrane ---------------------------------------------------------------
  filigrane: {
    alignItems: 'center',
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 300,
    transform: 'rotate(-28deg)',
  },
  filigraneTexteRefuse: {
    color: ROUGE,
    fontFamily: 'Helvetica-Bold',
    fontSize: 74,
    letterSpacing: 6,
    opacity: 0.16,
  },
  filigraneTexteAttente: {
    color: '#7A7A7A',
    fontFamily: 'Helvetica-Bold',
    fontSize: 30,
    letterSpacing: 3,
    opacity: 0.18,
  },

  // -- Pied de page -------------------------------------------------------------
  pied: { bottom: 0, left: 0, position: 'absolute', right: 0 },
  piedContenu: { flexDirection: 'row', paddingHorizontal: 38 },
  piedTextes: { flexGrow: 1, paddingRight: 10 },
  piedLigne: { color: GRIS, fontSize: 6.8, lineHeight: 1.45 },
  piedMentionLegale: { color: GRIS_CLAIR, fontSize: 6.2, marginTop: 3 },
  qrBloc: { alignItems: 'center', width: 58 },
  qrImage: { height: 50, width: 50 },
  qrLegende: { color: GRIS_CLAIR, fontSize: 4.6, marginTop: 1.5, textAlign: 'center' },
  bandeau: {
    backgroundColor: MARINE,
    marginTop: 6,
    paddingVertical: 5,
  },
  bandeauTexte: {
    color: '#FFFFFF',
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    letterSpacing: 1.6,
    textAlign: 'center',
  },
});

/** Croix des cases à cocher, dessinée pour ne dépendre d'aucune police. */
function Croix() {
  return (
    <Svg viewBox="0 0 11 11" style={{ height: 11, width: 11 }}>
      <Path d="M 2 2 L 9 9" stroke={NOIR} strokeWidth={1.4} />
      <Path d="M 9 2 L 2 9" stroke={NOIR} strokeWidth={1.4} />
    </Svg>
  );
}

function Champ({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <View style={styles.champ}>
      <Text style={styles.champLibelle}>{libelle}</Text>
      <Text style={styles.champSeparateur}>:</Text>
      <Text style={styles.champValeur}>{valeur}</Text>
    </View>
  );
}

/** `le 19/08/2026 a 13h00` — mise en forme reprise du formulaire papier. */
function dateHeure(date: Date): string {
  return `le ${formatDate(date)} à ${formatTime(date)}`;
}

const ORDRE_TRANSPORTS: { type: TransportType; libelle: string }[] = [
  { type: 'VEHICULE_ETABLISSEMENT', libelle: "Véhicule de l'établissement" },
  { type: 'VEHICULE_PERSONNEL', libelle: 'Véhicule personnel' },
  { type: 'VEHICULE_LOCATION', libelle: 'Véhicule de location' },
  { type: 'TRANSPORT_EN_COMMUN', libelle: 'Transport en commun' },
];

function Filigrane({ status }: { status: MissionStatus }) {
  if (status === MissionStatus.REJECTED) {
    return (
      <View style={styles.filigrane} fixed>
        <Text style={styles.filigraneTexteRefuse}>REFUSÉ</Text>
      </View>
    );
  }

  if (status === MissionStatus.SUBMITTED) {
    return (
      <View style={styles.filigrane} fixed>
        <Text style={styles.filigraneTexteAttente}>EN ATTENTE DE VALIDATION</Text>
      </View>
    );
  }

  if (status === MissionStatus.CANCELLED) {
    return (
      <View style={styles.filigrane} fixed>
        <Text style={styles.filigraneTexteAttente}>ANNULÉ</Text>
      </View>
    );
  }

  return null;
}

/** Contenu de la colonne « Ressources Humaines » du tableau de signatures. */
function ColonneRH({ donnees }: { donnees: DonneesPdf }) {
  if (donnees.status === MissionStatus.APPROVED && donnees.decidedAt) {
    return (
      <View style={styles.corpsColonne}>
        <Text style={styles.mentionValidation}>
          Validé électroniquement par{'\n'}
          {donnees.decidedByName ?? 'Ressources Humaines'}
          {'\n'}
          le {formatDateTime(donnees.decidedAt)}
        </Text>
        <Text style={styles.mentionNumero}>{donnees.numero}</Text>
      </View>
    );
  }

  if (donnees.status === MissionStatus.REJECTED && donnees.decidedAt) {
    return (
      <View style={styles.corpsColonne}>
        <Text style={styles.mentionRefus}>
          REFUSÉ{'\n'}
          le {formatDateTime(donnees.decidedAt)}
        </Text>
        {donnees.motifRefus ? (
          <Text style={styles.motifRefus}>
            {donnees.motifRefus.length > 120
              ? `${donnees.motifRefus.slice(0, 117)}...`
              : donnees.motifRefus}
          </Text>
        ) : null}
      </View>
    );
  }

  return <View style={styles.corpsColonne} />;
}

export function OrdreDeMissionPdf({ donnees }: { donnees: DonneesPdf }) {
  const numeroAffiche = estNumeroProvisoire(donnees.numero) ? 'Brouillon (non numéroté)' : donnees.numero;

  return (
    <Document
      title={`Ordre de mission ${numeroAffiche}`}
      author="PORTEO GROUP"
      subject={`${donnees.objet} — ${donnees.lieu}`}
      creator="Ordres de mission - PORTEO GROUP"
      producer="Ordres de mission - PORTEO GROUP"
    >
      <Page size="A4" style={styles.page} wrap={false}>
        <Filigrane status={donnees.status} />

        {/* En-tête : logo officiel, ou bloc typographique de remplacement */}
        <View style={styles.entete}>
          {donnees.logo ? (
            <Image src={donnees.logo} style={styles.logo} />
          ) : (
            <View style={styles.logoTexte}>
              <Text style={styles.logoMarque}>PORTEO</Text>
              <Text style={styles.logoSuite}>GROUP</Text>
            </View>
          )}
        </View>

        <View style={styles.titreBloc}>
          <Text style={styles.titre}>ORDRE DE MISSION EN COTE D&apos;IVOIRE</Text>
        </View>

        <View style={styles.bandeauMeta}>
          <Text style={styles.metaLibelle}>
            N&deg; : <Text style={styles.metaValeur}>{numeroAffiche}</Text>
          </Text>
          <Text style={styles.metaLibelle}>
            Date : <Text style={styles.metaValeur}>{formatDate(donnees.createdAt)}</Text>
          </Text>
        </View>

        {/* Champs, dans l'ordre exact du formulaire papier */}
        <Champ libelle="NOM" valeur={donnees.nom} />
        <Champ libelle="PRENOMS" valeur={donnees.prenoms} />
        <Champ libelle="MATRICULE" valeur={donnees.matricule} />
        <Champ libelle="FONCTION" valeur={donnees.fonction} />
        <Champ libelle="ANALYTIQUE" valeur={donnees.analytique ?? ''} />
        <Champ libelle="OBJET DE LA MISSION" valeur={donnees.objet} />
        <Champ libelle="LIEU DE LA MISSION" valeur={donnees.lieu} />
        <Champ libelle="DATE DE DEPART" valeur={dateHeure(donnees.dateDepart)} />
        <Champ libelle="DATE DE RETOUR" valeur={dateHeure(donnees.dateRetour)} />

        <View style={styles.trait} />

        <Text style={styles.phraseTransport}>
          Il utilisera les moyens de transport et la quantité de carburant suivants :
        </Text>

        {ORDRE_TRANSPORTS.map(({ type, libelle }) => {
          const retenu = donnees.transportType === type;
          return (
            <View key={type} style={styles.ligneCase}>
              <View style={styles.case}>{retenu ? <Croix /> : null}</View>
              <Text style={styles.caseLibelle}>{libelle}</Text>
              <Text style={styles.caseDetail}>
                {retenu ? (donnees.transportDetail ?? '') : ''}
              </Text>
            </View>
          );
        })}

        <View style={styles.ligneGasoil}>
          <Text style={styles.gasoilValeur}>{donnees.litresGasoil ?? ''}</Text>
          <Text style={styles.gasoilLibelle}>litres de gasoil</Text>
        </View>

        {/* Tableau des signatures */}
        <View style={styles.tableau}>
          <View style={styles.colonneSignature}>
            <View style={styles.enteteColonne}>
              <Text style={styles.enteteColonneTexte}>Supérieur Hiérarchique</Text>
            </View>
            <View style={styles.corpsColonne} />
          </View>

          <View style={styles.colonneSignature}>
            <View style={styles.enteteColonne}>
              <Text style={styles.enteteColonneTexte}>Ressources Humaines</Text>
            </View>
            <ColonneRH donnees={donnees} />
          </View>

          <View style={[styles.colonneSignature, styles.colonneSignatureFin]}>
            <View style={styles.enteteColonne}>
              <Text style={styles.enteteColonneTexte}>Directeur</Text>
            </View>
            <View style={styles.corpsColonne} />
          </View>
        </View>

        {/* Partie réservée à la sécurité — remplie manuellement au poste de garde */}
        <Text style={styles.titreSecurite}>Partie réservée à la sécurité</Text>
        <Text style={styles.sousTitreSecurite}>
          Suivi de l&apos;identité &amp; de la signature de l&apos;agent
        </Text>

        <View style={styles.tableau}>
          <View style={styles.colonneSecurite}>
            <View style={styles.enteteColonne}>
              <Text style={styles.enteteColonneTexte}>Heure de départ</Text>
            </View>
            <View style={styles.corpsColonne} />
          </View>
          <View style={[styles.colonneSecurite, styles.colonneSignatureFin]}>
            <View style={styles.enteteColonne}>
              <Text style={styles.enteteColonneTexte}>Heure d&apos;arrivée</Text>
            </View>
            <View style={styles.corpsColonne} />
          </View>
        </View>

        {/* Pied de page */}
        <View style={styles.pied} fixed>
          <View style={styles.piedContenu}>
            <View style={styles.piedTextes}>
              <Text style={styles.piedLigne}>
                contact@porteo-group.com &nbsp;-&nbsp; +225 27 21 54 03 03
              </Text>
              <Text style={styles.piedLigne}>
                ABIDJAN-MARCORY IMMEUBLE PORTEO, Boulevard Valery Giscard D&apos;Estaing; 08 BP 2212
                Abidjan 09
              </Text>
              <Text style={styles.piedMentionLegale}>
                Capital 2 000 000 000 F CFA - N&deg; RC: CI-ABJ-2017-B16427 / N&deg; CC: 172923 G
              </Text>
            </View>

            <View style={styles.qrBloc}>
              <Image src={donnees.qrCode} style={styles.qrImage} />
              <Text style={styles.qrLegende}>Vérifier</Text>
            </View>
          </View>

          <View style={styles.bandeau}>
            <Text style={styles.bandeauTexte}>WWW.PORTEO-GROUP.COM</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/** Vue en ligne du filigrane, pour la légende d'aperçu. */
export function libelleFiligrane(status: MissionStatus): string | null {
  switch (status) {
    case MissionStatus.REJECTED:
      return 'REFUSÉ';
    case MissionStatus.SUBMITTED:
      return 'EN ATTENTE DE VALIDATION';
    case MissionStatus.CANCELLED:
      return 'ANNULÉ';
    default:
      return null;
  }
}
