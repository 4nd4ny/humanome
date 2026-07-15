<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

use PDO;
use RuntimeException;

/**
 * Seed idempotent du modèle de compétence ATOMIQUE (migration 016) depuis le
 * corpus (scripts/data/competences-v7.json + version publiée du référentiel).
 * Partagé par le script CLI (scripts/seed-competences.php) et l'endpoint de
 * déploiement (POST /api/admin/seed-competences), car l'hébergement OVH est
 * FTP-only (pas de SSH) : le seed distant passe par l'API.
 *
 * Applique le GATE DE PARITÉ : le corps assemblé (SnapshotAssembler →
 * ContentHash::compute) DOIT être byte-identique au snapshot publié, sinon
 * échec (aucun oracle moteur/Twin9 ne doit bouger).
 */
final class CompetenceSeeder
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * @param array<string, array<string,mixed>> $rich contenu riche par code (competences-v7.json .competences)
     * @return array{poles:int, imported:int, unchanged:int, parityHash:string, lockLinks:int}
     */
    public function seed(array $rich): array
    {
        $refRepo = new ReferentielRepository($this->pdo);
        $published = $refRepo->publishedVersions(ReferentielRepository::DEFAULT_REFERENTIEL_ID);
        if ($published === []) {
            throw new RuntimeException('Aucune version publiée du référentiel — importer respire-v7 d\'abord.');
        }

        // Structure de référence : la plus ancienne publiée (même corps structurel partout).
        $structuralDoc = $published[\count($published) - 1]['content'];
        $expectedHash = $published[\count($published) - 1]['contentHash'];
        foreach ($published as $v) {
            if ($v['semver'] === '7.0.0') {
                $structuralDoc = $v['content'];
                $expectedHash = $v['contentHash'];
            }
        }

        // 1. pôles
        $poleStmt = $this->pdo->prepare(
            'INSERT INTO referentiel_poles (num, nom, couleur) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE nom = VALUES(nom), couleur = VALUES(couleur)'
        );
        foreach ($structuralDoc['poles'] as $pole) {
            $poleStmt->execute([$pole['num'], $pole['nom'], $pole['couleur'] ?? null]);
        }

        // 2. compétences atomiques (nom/pôle STRUCTURELS = publié)
        $compRepo = new CompetenceRepository($this->pdo);
        $imported = 0;
        $unchanged = 0;
        foreach ($structuralDoc['competences'] as $c) {
            $code = $c['code'];
            if (!isset($rich[$code])) {
                throw new RuntimeException(sprintf('Contenu riche manquant pour %s', $code));
            }
            $result = $compRepo->importPublishedCompetence(
                $code,
                $c['nom'],
                (int) $c['pole'],
                $rich[$code],
                '1.0.0',
                'Seed initial depuis le corpus YAML RESPIRE v7',
            );
            $result['status'] === 'imported' ? $imported++ : $unchanged++;
        }

        // 3. GATE DE PARITÉ
        $assembledHash = (new SnapshotAssembler($this->pdo))->structuralHash();
        if ($assembledHash !== $expectedHash) {
            throw new RuntimeException(sprintf(
                'Gate de parité ÉCHOUÉ : corps assemblé %s ≠ publié %s (nom/pôle structurel divergent).',
                $assembledHash,
                $expectedHash,
            ));
        }

        // 4. lockfile (provenance des releases existantes). WRITE-ONCE par
        // (release, code) : la composition d'une release est immuable — un
        // re-seed après des éditions ne doit PAS réécrire l'historique (INSERT
        // IGNORE conserve le lien initial 1.0.0).
        $lock = $this->pdo->prepare(
            'INSERT IGNORE INTO referentiel_snapshot_competences (snapshot_version_id, competence_code, competence_version_id, content_hash)
             VALUES (?, ?, ?, ?)'
        );
        $byCode = $compRepo->latestPublishedByCode();
        $links = 0;
        foreach ($published as $release) {
            foreach ($release['content']['competences'] as $c) {
                $cv = $byCode[$c['code']] ?? null;
                if ($cv === null) {
                    continue;
                }
                $lock->execute([$release['id'], $c['code'], $cv['id'], $cv['contentHash']]);
                $links++;
            }
        }

        return [
            'poles' => \count($structuralDoc['poles']),
            'imported' => $imported,
            'unchanged' => $unchanged,
            'parityHash' => $assembledHash,
            'lockLinks' => $links,
        ];
    }
}
