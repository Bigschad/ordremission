/**
 * Dérive `prisma/schema.sqlite.prisma` du schéma PostgreSQL de production.
 *
 *   pnpm db:sqlite:schema
 *
 * Prisma n'accepte pas `provider = env(...)` dans un bloc `datasource` : il
 * faut donc un second fichier. Il est **généré**, jamais édité à la main et
 * jamais versionné — le schéma PostgreSQL reste l'unique source de vérité, et
 * les deux ne peuvent pas diverger.
 *
 * Deux adaptations suffisent :
 *   - `@db.Text` et `@db.Decimal(p, s)` : types natifs PostgreSQL, sans
 *     équivalent SQLite (les colonnes deviennent TEXT et DECIMAL) ;
 *   - `directUrl` : propre au pooling Neon, sans objet sur un fichier local.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SOURCE = path.join(process.cwd(), 'prisma', 'schema.prisma');
const CIBLE = path.join(process.cwd(), 'prisma', 'schema.sqlite.prisma');

const ENTETE = `// ⚠️  FICHIER GÉNÉRÉ — NE PAS MODIFIER
// Produit par \`pnpm db:sqlite:schema\` à partir de prisma/schema.prisma.
// Toute modification doit être faite dans le schéma PostgreSQL, qui fait foi.
`;

function convertir(schema: string): string {
  return (
    ENTETE +
    schema
      // Le commentaire d'en-tête d'origine décrit la cible PostgreSQL.
      .replace(
        /^\/\/ Schéma Prisma.*\n\/\/ Base :.*\n/m,
        '// Schéma Prisma — Ordres de mission PORTEO GROUP\n' +
          '// Base : SQLite, pour la démonstration et les tests sans infrastructure.\n',
      )
      .replace(/provider\s*=\s*"postgresql"/, 'provider = "sqlite"')
      // `directUrl` n'a de sens que pour le pooling Neon.
      .replace(/^\s*directUrl\s*=\s*env\("DIRECT_URL"\)\s*$\n/m, '')
      // Types natifs PostgreSQL, sans équivalent SQLite.
      .replace(/\s*@db\.Text/g, '')
      .replace(/\s*@db\.Decimal\(\s*\d+\s*,\s*\d+\s*\)/g, '')
  );
}

function main(): void {
  const schema = readFileSync(SOURCE, 'utf8');
  const converti = convertir(schema);

  if (converti.includes('@db.')) {
    const restants = [...converti.matchAll(/@db\.\w+(\([^)]*\))?/g)].map((m) => m[0]);
    console.error(
      `Types natifs non convertis, à traiter dans scripts/schema-sqlite.ts : ${[...new Set(restants)].join(', ')}`,
    );
    process.exit(1);
  }

  writeFileSync(CIBLE, converti, 'utf8');
  console.log(`✓ ${path.relative(process.cwd(), CIBLE)} généré depuis le schéma PostgreSQL.`);
}

main();
