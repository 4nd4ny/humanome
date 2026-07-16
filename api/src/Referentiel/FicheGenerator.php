<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

use PDO;

/**
 * SOURCE UNIQUE des fiches de scan (2026-07-16) : reconstruit, DEPUIS LA BASE
 * (referentiel_poles.header + competence_versions.content.fiche), les artefacts
 * que Twin6 et Twin9 consomment — de façon DÉTERMINISTE et BYTE-EXACTE.
 *
 * Deux sorties, deux règles distinctes (toutes deux prouvées byte-identiques
 * aux fichiers d'or par scripts/extract-fiches.mjs et le gate PHP FicheParityTest) :
 *
 *  1. poleFiches() → les 7 P*.md (paquet Twin6 public). RÈGLE (b) :
 *       P*.md = header_brut + Σ competence.fiche joint par "\n\n" + "\n"
 *     (le séparateur `---` vit DÉJÀ à la fin du header et de chaque fiche sauf
 *     la dernière du pôle — d'où le join "\n\n" SEUL, ≠ ficheComplete).
 *
 *  2. fichesStructure() → la structure du setting twin9_fiches (FicheStore).
 *     Le réassemblage runtime POLE_FICHES (FicheStore::poleFiches) reste
 *     INCHANGÉ (rtrim+"\n\n"+join("\n\n---\n\n")+"\n", `---` doublé) : on stocke
 *     les MÊMES octets de fiche_md → COMPETENCE_FICHE et POLE_FICHES intacts.
 */
final class FicheGenerator
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array<int, array{num:int, header:string, codes:list<string>, fiches:array<string,string>}> par pôle */
    private function byPole(): array
    {
        $headers = [];
        foreach ($this->pdo->query('SELECT num, header FROM referentiel_poles ORDER BY num')->fetchAll() as $r) {
            $headers[(int) $r['num']] = ['num' => (int) $r['num'], 'header' => (string) ($r['header'] ?? ''), 'codes' => [], 'fiches' => []];
        }
        $comps = (new CompetenceRepository($this->pdo))->latestPublishedByCode(); // triées par code
        foreach ($comps as $c) {
            $pole = (int) $c['pole'];
            if (!isset($headers[$pole])) {
                $headers[$pole] = ['num' => $pole, 'header' => '', 'codes' => [], 'fiches' => []];
            }
            $fiche = $c['content']['fiche'] ?? null;
            if (\is_string($fiche)) {
                $headers[$pole]['codes'][] = $c['code'];
                $headers[$pole]['fiches'][$c['code']] = $fiche;
            }
        }
        ksort($headers);

        return $headers;
    }

    /**
     * Les 7 fiches de pôle en markdown (P*.md), byte-exactes. RÈGLE (b).
     *
     * @return array<int, string> num => contenu P{num}.md
     */
    public function poleFiches(): array
    {
        $out = [];
        foreach ($this->byPole() as $pole) {
            $fiches = array_map(static fn (string $code): string => $pole['fiches'][$code], $pole['codes']);
            $out[$pole['num']] = $pole['header'] . implode("\n\n", $fiches) . "\n";
        }

        return $out;
    }

    /**
     * Forme CORPUS (inverse du seed) : { poleHeaders: {num: header},
     * fiches: {code: fiche_md} }. Permet de re-synchroniser le corpus committé
     * (fiches-v7.json) DEPUIS la base après une édition dans l'atelier — pour
     * que Twin6 (qui dérive du corpus au build) reste aligné sur la base.
     *
     * @return array{poleHeaders: array<string,string>, fiches: array<string,string>}
     */
    public function corpus(): array
    {
        $poleHeaders = [];
        $fiches = [];
        foreach ($this->byPole() as $pole) {
            $poleHeaders[(string) $pole['num']] = $pole['header'];
            foreach ($pole['codes'] as $code) {
                $fiches[$code] = $pole['fiches'][$code];
            }
        }

        return ['poleHeaders' => $poleHeaders, 'fiches' => $fiches];
    }

    /**
     * Structure attendue par FicheStore::store (setting twin9_fiches).
     *
     * @return list<array{num:int, header:string, competences:list<array{code:string, fiche_md:string}>}>
     */
    public function fichesStructure(): array
    {
        $out = [];
        foreach ($this->byPole() as $pole) {
            $competences = [];
            foreach ($pole['codes'] as $code) {
                $competences[] = ['code' => $code, 'fiche_md' => $pole['fiches'][$code]];
            }
            $out[] = ['num' => $pole['num'], 'header' => $pole['header'], 'competences' => $competences];
        }

        return $out;
    }
}
