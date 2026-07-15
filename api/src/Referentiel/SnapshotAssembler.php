<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

use PDO;

/**
 * Assemble les compétences ATOMIQUES publiées + les pôles en un DOCUMENT
 * référentiel (snapshot/release). Point d'articulation entre le modèle atomique
 * (édition/gouvernance par compétence) et la couche de COMPOSITION que le moteur
 * consomme et que les cartographies épinglent (reproductibilité).
 *
 * ⚠️ Le corps HACHÉ est {poles:[{num,nom,couleur}], competences:[{code,nom,pole}]}
 * et le hash passe par ContentHash::compute — AUCUNE ré-implémentation de la
 * canonicalisation (élimine le piège localeCompare/strcmp/encodage). Comme les
 * nom/pôle sont STRUCTURELS (== version publiée), le corps assemblé === corps
 * publié PAR CONSTRUCTION → le contentHash reste byte-identique (parité moteur/
 * Twin9 intacte). Les champs riches (définition…) sont embarqués HORS hash.
 */
final class SnapshotAssembler
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return list<array{num:int, nom:string, couleur:string|null}> pôles triés par num */
    public function poles(): array
    {
        $rows = $this->pdo->query('SELECT num, nom, couleur FROM referentiel_poles ORDER BY num')->fetchAll();

        return array_map(static fn (array $r): array => [
            'num' => (int) $r['num'],
            'nom' => (string) $r['nom'],
            'couleur' => $r['couleur'] !== null ? (string) $r['couleur'] : null,
        ], $rows);
    }

    /**
     * Corps STRUCTUREL (entrée du hash) depuis les compétences publiées.
     *
     * @return array{poles: list<array<string,mixed>>, competences: list<array<string,mixed>>}
     */
    public function assembleBody(): array
    {
        $competences = [];
        foreach ((new CompetenceRepository($this->pdo))->latestPublishedByCode() as $c) {
            $competences[] = ['code' => $c['code'], 'nom' => $c['nom'], 'pole' => $c['pole']];
        }

        return ['poles' => $this->poles(), 'competences' => $competences];
    }

    /** Hash structurel du snapshot courant (via ContentHash::compute, INCHANGÉ). */
    public function structuralHash(): string
    {
        return ContentHash::compute($this->assembleBody());
    }

    /**
     * Document référentiel complet assemblé depuis les compétences publiées :
     * corps structurel + champ `description` embarqué par compétence (HORS hash,
     * pour la consultation publique). Conforme à schemas/referentiel.schema.json.
     *
     * @return array<string, mixed>
     */
    public function assembleDocument(string $version, string $label, string $source): array
    {
        $repo = new CompetenceRepository($this->pdo);
        $competences = [];
        foreach ($repo->latestPublishedByCode() as $c) {
            $entry = ['code' => $c['code'], 'nom' => $c['nom'], 'pole' => $c['pole']];
            $definition = $c['content']['identite']['definition'] ?? null;
            if (\is_string($definition) && trim($definition) !== '') {
                $entry['description'] = trim($definition);
            }
            $competences[] = $entry;
        }

        $doc = [
            'schemaVersion' => '1.0.0',
            'kind' => 'referentiel',
            'id' => ReferentielRepository::DEFAULT_REFERENTIEL_ID,
            'version' => $version,
            'label' => $label,
            'contentHash' => '',
            'source' => $source,
            'poles' => $this->poles(),
            'competences' => $competences,
        ];

        // Ordre canonique + contentHash recalculé (structurel).
        return ContentHash::normalize($doc);
    }
}
