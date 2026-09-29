<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Db;
use Humanome\Llm\LlmRuntime;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\LlmFakeHttpClient;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\TwinSupport;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\Twin9Config;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-PRO-08 — Éditer les gabarits du Golden Prompt Twin9 : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/promptologue/UC-PRO-08-editer-gabarits-twin9.md
 *
 * L'atelier est rejoué à travers l'API HTTP (Slim en processus, vraie base
 * MySQL) avec les chemins EXACTS qu'envoie le front : nom hiérarchique encodé
 * « lourd%2F20-greffier ». L'import technique (script de déploiement,
 * X-Migrate-Token) sert de précondition et de scénario alternatif. Tous les
 * gabarits sont FICTIFS ; aucun appel réseau (faux client HTTP).
 */
final class UcPro08EditerGabaritsTwin9Test extends CartographeTestCase
{
    private const TOKEN = 'migrate-token-uc-pro-08';
    private const ENC = 'lourd%2F20-greffier';

    /** @var array{id: int, csrf: string, sid: string} */
    private array $atelier;

    protected function setUp(): void
    {
        parent::setUp();
        $pdo = Db::get();
        $pdo->exec('DELETE FROM twin9_protocole_versions');
        $pdo->exec('DELETE FROM twin9_protocole');
        $pdo->exec("DELETE FROM settings WHERE name IN ('twin9_config', 'twin9_fiches', 'twin9_referentiel')");
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
        $this->atelier = $this->registerAs('camille@example.org', 'Camille', ['admin', 'promptologue']);
    }

    protected function tearDown(): void
    {
        LlmRuntime::setHttpClient(null);
        parent::tearDown();
    }

    /** Précondition : le script d'import scripts/twin9/import-protocole.mjs (X-Migrate-Token) importe les gabarits (A4). */
    private function importer(array $files, array $extra = []): ResponseInterface
    {
        $this->cookieSid = null;

        return $this->request('POST', '/api/admin/twin9/import', array_merge(['files' => $files], $extra), ['X-Migrate-Token' => self::TOKEN]);
    }

    private function atelier(string $method, string $path, ?array $body = null, ?array $user = null): ResponseInterface
    {
        return $this->as_($user ?? $this->atelier, $method, '/api/twin9/admin' . $path, $body);
    }

    #[TestDox('UC-PRO-08-F08 — nominal : liste sans contenu → lecture (nom encodé %2F) → édition versionnée → historique → version archivée → restauration → banc d’essai')]
    public function testF08NominalEditingSession(): void
    {
        $this->importer(['lourd/20-greffier' => TwinSupport::GABARIT_GREFFIER, 'tagger/1-tag-pole' => TwinSupport::GABARIT_TAG]);

        $liste = self::json($this->atelier('GET', '/protocole'));
        self::assertSame(['lourd/20-greffier', 'tagger/1-tag-pole'], array_column($liste['protocole'], 'name'));
        self::assertStringNotContainsString('Greffier FICTIF', json_encode($liste, JSON_UNESCAPED_UNICODE));

        $lu = self::json($this->atelier('GET', '/protocole/' . self::ENC));
        self::assertSame(TwinSupport::GABARIT_GREFFIER, $lu['content']);

        $nouveau = TwinSupport::GABARIT_GREFFIER . "\nPièces : {\$PIECES}";
        $put = self::json($this->atelier('PUT', '/protocole/' . self::ENC, ['content' => $nouveau]));
        self::assertSame(['name' => 'lourd/20-greffier', 'variables' => ['COMPETENCE_FICHE', 'POLE_FICHES', 'CODE', 'EXTRAIT', 'PIECES'], 'status' => 'updated'], $put);
        // A1 : même contenu renvoyé → « unchanged », aucune version créée.
        self::assertSame('unchanged', self::json($this->atelier('PUT', '/protocole/' . self::ENC, ['content' => $nouveau]))['status']);

        $versions = self::json($this->atelier('GET', '/protocole/' . self::ENC . '/versions'));
        self::assertSame('lourd/20-greffier', $versions['name']);
        self::assertSame([1], array_column($versions['versions'], 'version'));
        self::assertSame(TwinSupport::GABARIT_GREFFIER, self::json($this->atelier('GET', '/protocole/' . self::ENC . '/versions/1'))['content']);

        $restore = self::json($this->atelier('POST', '/protocole/' . self::ENC . '/restore', ['version' => 1]));
        self::assertSame(['updated', 1], [$restore['status'], $restore['restored_from']]);
        self::assertSame(TwinSupport::GABARIT_GREFFIER, self::json($this->atelier('GET', '/protocole/' . self::ENC))['content']);
        self::assertSame([2, 1], array_column(self::json($this->atelier('GET', '/protocole/' . self::ENC . '/versions'))['versions'], 'version'));
        // A2 : restaurer une version identique au vivant ne crée rien.
        $encore = self::json($this->atelier('POST', '/protocole/' . self::ENC . '/restore', ['version' => 1]));
        self::assertSame(['unchanged', 1], [$encore['status'], $encore['restored_from']]);
        self::assertSame([2, 1], array_column(self::json($this->atelier('GET', '/protocole/' . self::ENC . '/versions'))['versions'], 'version'));

        // A3 : le banc d'essai ne fait AUCUN appel au modèle et ne débite rien.
        $http = new LlmFakeHttpClient();
        LlmRuntime::setHttpClient($http);
        $rendu = self::json($this->atelier('POST', '/tester', ['name' => 'lourd/20-greffier', 'variables' => ['CODE' => '1.01', 'EXTRAIT' => 'x']]));
        self::assertStringContainsString('Code 1.01 — extrait : x', $rendu['rendu']);
        self::assertSame(['COMPETENCE_FICHE', 'POLE_FICHES'], $rendu['non_resolues'], 'le banc d’essai n’injecte pas les fiches');
        self::assertSame([], $http->requests);
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_credit_events')->fetchColumn());
        self::assertSame($this->atelier['id'], (int) self::$pdo->query("SELECT updated_by FROM twin9_protocole WHERE name = 'lourd/20-greffier'")->fetchColumn(), 'édition attribuée');
    }

    #[TestDox('UC-PRO-08-F09 — nominal (effet) : l’édition s’applique IMMÉDIATEMENT aux appels des apprenants (/api/twin9/appel rend le nouveau contenu)')]
    public function testF09EditReachesLearnersImmediately(): void
    {
        $this->importer(['tagger/1-tag-pole' => 'Ancienne consigne FICTIVE {$TEXTE_JOURNEE}']);
        $http = new LlmFakeHttpClient();
        LlmRuntime::setHttpClient($http);
        TestDb::setEnv('ANTHROPIC_API_KEY', TwinSupport::PLATFORM_KEY);
        $apprenant = $this->registerAs('lea@example.org', 'Léa', ['apprenant']);
        (new CreditService(Db::get()))->topup($apprenant['id'], 5_000_000, 'ORDER-PRO-08');

        self::assertSame(200, $this->atelier('PUT', '/protocole/tagger%2F1-tag-pole', ['content' => 'Nouvelle consigne FICTIVE {$TEXTE_JOURNEE}'])->getStatusCode());
        TwinSupport::queueAnthropic($http, 'ok');
        $appel = $this->as_($apprenant, 'POST', '/api/twin9/appel', [
            'etape' => 'tagger/1-tag-pole',
            'variables' => ['TEXTE_JOURNEE' => 'journal'],
            'modele' => 'claude-sonnet-5',
            'etage' => 'taggers',
            'facturation' => 'platform',
        ]);
        self::assertSame(200, $appel->getStatusCode(), (string) $appel->getBody());
        self::assertSame('Nouvelle consigne FICTIVE journal', json_decode((string) $http->requests[0]['body'], true)['messages'][0]['content']);
    }

    #[TestDox('UC-PRO-08-F10 — A4 : import technique (X-Migrate-Token) — gabarits, réglages, référentiel, fiches (injectées ensuite dans les appels) ; active Twin9 ; réimport identique sans nouvelle version')]
    public function testF10TechnicalImport(): void
    {
        $response = $this->importer(
            ['lourd/20-greffier' => TwinSupport::GABARIT_GREFFIER, 'tagger/1-tag-pole' => TwinSupport::GABARIT_TAG],
            ['config' => ['jury' => ['taille_aleatoire' => 5]], 'referentiel' => TwinSupport::referentielFictif(), 'fiches' => TwinSupport::fichesFictives()],
        );
        self::assertSame(['imported' => 2], self::json($response));

        $config = new Twin9Config(new SettingsRepository(Db::get()));
        self::assertTrue($config->isEnabled());
        self::assertEquals(['jury' => ['taille_aleatoire' => 5]], $config->pipeline(), 'colonne JSON : même contenu');
        $apprenant = $this->registerAs('lea@example.org', 'Léa', ['apprenant']);
        $metaRaw = (string) $this->as_($apprenant, 'GET', '/api/twin9/meta')->getBody();
        $meta = json_decode($metaRaw, true);
        self::assertSame(['lourd/20-greffier', 'tagger/1-tag-pole'], array_column($meta['etapes'], 'name'));
        self::assertSame('CŒUR — Relier & Naviguer', $meta['referentiel'][1]['nom']);
        self::assertStringNotContainsString('FICHE FICTIVE', $metaRaw, 'les fiches restent serveur');

        // Les fiches importées sont bien STOCKÉES : le serveur les injecte dans l'appel d'un apprenant.
        $http = new LlmFakeHttpClient();
        LlmRuntime::setHttpClient($http);
        TestDb::setEnv('ANTHROPIC_API_KEY', TwinSupport::PLATFORM_KEY);
        (new CreditService(Db::get()))->topup($apprenant['id'], 5_000_000, 'ORDER-PRO-08-F10');
        TwinSupport::queueAnthropic($http, 'Dossier fictif.');
        $appel = $this->as_($apprenant, 'POST', '/api/twin9/appel', [
            'etape' => 'lourd/20-greffier',
            'variables' => ['CODE' => '1.01', 'EXTRAIT' => 'x', 'POLE_NUM' => 1],
            'modele' => 'claude-sonnet-5',
            'etage' => 'rapide',
            'facturation' => 'platform',
        ]);
        self::assertSame(200, $appel->getStatusCode(), (string) $appel->getBody());
        $prompt = json_decode((string) $http->requests[0]['body'], true)['messages'][0]['content'];
        self::assertStringContainsString('Fiche : ' . TwinSupport::FICHE_SECRETE, $prompt);
        self::assertStringContainsString('PRÉAMBULE FICTIF DU PÔLE 1', $prompt);

        self::assertSame(['imported' => 2], self::json($this->importer(['lourd/20-greffier' => TwinSupport::GABARIT_GREFFIER, 'tagger/1-tag-pole' => TwinSupport::GABARIT_TAG])));
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_protocole_versions')->fetchColumn());
    }

    #[TestDox('UC-PRO-08-F11 — E1 : visiteur 401 ; promptologue SEUL et admin SEUL 403 — sur toutes les routes de contenu, sans aucun fragment')]
    public function testF11ConjunctionIsRequiredEverywhere(): void
    {
        $this->importer(['lourd/20-greffier' => TwinSupport::GABARIT_GREFFIER]);
        $this->atelier('PUT', '/protocole/' . self::ENC, ['content' => 'Greffier FICTIF modifié']);
        $routes = [
            ['GET', '/protocole', null],
            ['GET', '/protocole/' . self::ENC, null],
            ['GET', '/protocole/' . self::ENC . '/versions', null],
            ['GET', '/protocole/' . self::ENC . '/versions/1', null],
            ['PUT', '/protocole/' . self::ENC, ['content' => 'piratage']],
            ['POST', '/protocole/' . self::ENC . '/restore', ['version' => 1]],
            ['POST', '/tester', ['name' => 'lourd/20-greffier']],
        ];
        $promptologue = $this->registerAs('promptologue@example.org', 'Prompto', ['promptologue']);
        $admin = $this->registerAs('admin@example.org', 'Admin', ['admin']);
        foreach ($routes as [$method, $path, $body]) {
            $this->cookieSid = null;
            self::assertSame(401, $this->request($method, '/api/twin9/admin' . $path, $body)->getStatusCode(), "visiteur $method $path");
            foreach ([$promptologue, $admin] as $user) {
                $response = $this->atelier($method, $path, $body, $user);
                self::assertSame(403, $response->getStatusCode(), "$method $path");
                self::assertSame(['error' => 'Rôle insuffisant'], self::json($response));
            }
        }
        self::assertSame('Greffier FICTIF modifié', (string) self::$pdo->query("SELECT content FROM twin9_protocole WHERE name = 'lourd/20-greffier'")->fetchColumn());
    }

    #[TestDox('UC-PRO-08-F12 — E2 : gabarit ou version inconnus → 404 générique (lecture, historique, restauration, banc d’essai, y compris nom hors format) ; A5 : un PUT sur un nom valide inconnu CRÉE le gabarit')]
    public function testF12UnknownTemplateOrVersion(): void
    {
        $this->importer(['lourd/20-greffier' => TwinSupport::GABARIT_GREFFIER]);
        foreach ([
            ['GET', '/protocole/lourd%2Finconnu', null, 'Gabarit introuvable'],
            ['GET', '/protocole/lourd%2Finconnu/versions', null, 'Gabarit introuvable'],
            ['GET', '/protocole/' . self::ENC . '/versions/3', null, 'Version introuvable'],
            ['POST', '/protocole/' . self::ENC . '/restore', ['version' => 3], 'Version introuvable'],
            ['POST', '/protocole/lourd%2Finconnu/restore', ['version' => 1], 'Gabarit introuvable'],
            ['POST', '/tester', ['name' => 'lourd/inconnu'], 'Gabarit introuvable'],
            // Nom HORS FORMAT : restauration et banc d'essai répondent 404 (get() avant toute validation), pas 422.
            ['POST', '/protocole/lourd%2F%2Fdouble/restore', ['version' => 1], 'Gabarit introuvable'],
            ['POST', '/tester', ['name' => 'lourd//double'], 'Gabarit introuvable'],
        ] as [$method, $path, $body, $message]) {
            $response = $this->atelier($method, $path, $body);
            self::assertSame(404, $response->getStatusCode(), "$method $path");
            self::assertSame(['error' => $message], self::json($response));
        }

        // A5 (comportement figé) : l'étape 4 n'a pas de 404 — un PUT sur un nom
        // valide inconnu crée le gabarit, aussitôt appelable par /api/twin9/appel.
        $cree = $this->atelier('PUT', '/protocole/lourd%2Finconnu', ['content' => 'Gabarit FICTIF créé par l’API {$CODE}']);
        self::assertSame(200, $cree->getStatusCode());
        self::assertSame(['name' => 'lourd/inconnu', 'variables' => ['CODE'], 'status' => 'created'], self::json($cree));
        self::assertSame($this->atelier['id'], (int) self::$pdo->query("SELECT updated_by FROM twin9_protocole WHERE name = 'lourd/inconnu'")->fetchColumn());
        self::assertSame(0, (int) self::$pdo->query("SELECT COUNT(*) FROM twin9_protocole_versions WHERE name = 'lourd/inconnu'")->fetchColumn());
    }

    #[TestDox('UC-PRO-08-F13 — E3 : saisies invalides → 422 (contenu vide ou ≥ 256 Ko, nom invalide, version manquante, banc sans nom) ; rien n’est écrit')]
    public function testF13InvalidInputs(): void
    {
        $this->importer(['lourd/20-greffier' => TwinSupport::GABARIT_GREFFIER]);
        foreach ([
            ['PUT', '/protocole/' . self::ENC, [], 'Champ requis : content (texte non vide)'],
            ['PUT', '/protocole/' . self::ENC, ['content' => ''], 'Champ requis : content (texte non vide)'],
            ['PUT', '/protocole/' . self::ENC, ['content' => " \n "], 'Contenu de gabarit requis'],
            ['PUT', '/protocole/' . self::ENC, ['content' => str_repeat('a', 262144)], 'Gabarit trop volumineux (maximum 256 Ko)'],
            ['PUT', '/protocole/lourd%2F%2Fdouble', ['content' => 'x'], 'Nom de gabarit invalide'],
            ['POST', '/protocole/' . self::ENC . '/restore', [], 'Champ requis : version (entier >= 1)'],
            ['POST', '/protocole/' . self::ENC . '/restore', ['version' => '1'], 'Champ requis : version (entier >= 1)'],
            ['POST', '/protocole/' . self::ENC . '/restore', ['version' => 0], 'Champ requis : version (entier >= 1)'],
            ['POST', '/tester', ['variables' => ['CODE' => '1.01']], 'Champ requis : name'],
        ] as [$method, $path, $body, $message]) {
            $response = $this->atelier($method, $path, $body);
            self::assertSame(422, $response->getStatusCode(), $message);
            self::assertSame($message, self::json($response)['error']);
        }
        self::assertSame(TwinSupport::GABARIT_GREFFIER, (string) self::$pdo->query("SELECT content FROM twin9_protocole WHERE name = 'lourd/20-greffier'")->fetchColumn());
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_protocole')->fetchColumn());
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_protocole_versions')->fetchColumn());
    }

    #[TestDox('UC-PRO-08-F14 — E4 : import refusé (jeton non configuré 404, mauvais 403, sans fichier 400) ; ANOMALIE figée : fichier invalide → 422 mais import PARTIEL')]
    public function testF14ImportRefusalsAndPartialImport(): void
    {
        TestDb::setEnv('MIGRATE_TOKEN', '');
        self::assertSame(404, $this->importer(['lourd/20-greffier' => 'x'])->getStatusCode());
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
        $this->cookieSid = null;
        $faux = $this->request('POST', '/api/admin/twin9/import', ['files' => ['a' => 'x']], ['X-Migrate-Token' => 'faux']);
        self::assertSame(403, $faux->getStatusCode());
        self::assertSame(['error' => 'Forbidden'], self::json($faux));
        // Une session d'atelier ne remplace pas le jeton de déploiement.
        $session = $this->as_($this->atelier, 'POST', '/api/admin/twin9/import', ['files' => ['a' => 'x']]);
        self::assertSame(403, $session->getStatusCode());
        self::assertSame(['error' => 'Forbidden'], self::json($session));
        $vide = $this->importer([]);
        self::assertSame(400, $vide->getStatusCode());
        self::assertSame(['error' => 'Body must contain a non-empty files map'], self::json($vide));
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_protocole')->fetchColumn());

        // Comportement ACTUEL (premier import) : les fichiers valides AVANT le
        // fichier invalide sont écrits (pas de transaction), et Twin9 n'est pas
        // activé ; le 422 cite le NOM du fichier fautif (destiné au détenteur du jeton).
        $partiel = $this->importer(['tagger/1-tag-pole' => TwinSupport::GABARIT_TAG, 'lourd/20-greffier' => ['pas', 'une', 'chaine']]);
        self::assertSame(422, $partiel->getStatusCode());
        self::assertSame('Fichier invalide : lourd/20-greffier', self::json($partiel)['error']);
        self::assertSame(['tagger/1-tag-pole'], self::$pdo->query('SELECT name FROM twin9_protocole')->fetchAll(\PDO::FETCH_COLUMN));
        self::assertFalse((new Twin9Config(new SettingsRepository(Db::get())))->isEnabled());

        // RÉIMPORT (cas courant en production) : Twin9 déjà activé le RESTE, et
        // sert un mélange de gabarits neufs et anciens ; référentiel non mis à jour.
        self::assertSame(200, $this->importer(
            ['tagger/1-tag-pole' => 'Tag FICTIF v1 {$TEXTE_JOURNEE}', 'lourd/20-greffier' => 'Greffier FICTIF v1 {$CODE}', 'merge/04-rapporteur' => 'Rapporteur FICTIF v1'],
            ['referentiel' => TwinSupport::referentielFictif()],
        )->getStatusCode());
        $second = $this->importer(
            ['tagger/1-tag-pole' => 'Tag FICTIF v2 {$TEXTE_JOURNEE}', 'lourd/20-greffier' => 42, 'merge/04-rapporteur' => 'Rapporteur FICTIF v2'],
            ['referentiel' => [['num' => 9, 'nom' => 'PÔLE FICTIF NEUF', 'competences' => []]]],
        );
        self::assertSame(422, $second->getStatusCode());
        $config = new Twin9Config(new SettingsRepository(Db::get()));
        self::assertTrue($config->isEnabled(), 'Twin9 reste ACTIVÉ après un réimport partiel');
        $contenus = self::$pdo->query('SELECT name, content FROM twin9_protocole ORDER BY name')->fetchAll(\PDO::FETCH_KEY_PAIR);
        self::assertSame([
            'lourd/20-greffier' => 'Greffier FICTIF v1 {$CODE}',
            'merge/04-rapporteur' => 'Rapporteur FICTIF v1',
            'tagger/1-tag-pole' => 'Tag FICTIF v2 {$TEXTE_JOURNEE}',
        ], $contenus);
        self::assertSame('TÊTE — Penser & Comprendre', $config->referentiel()[0]['nom'], 'référentiel inchangé');
    }

    #[TestDox('UC-PRO-08-F15 — E6 : session d’atelier valide mais jeton CSRF absent ou faux → 403 sur PUT, restauration et banc d’essai ; rien n’est écrit')]
    public function testF15CsrfTokenIsRequiredOnAtelierWrites(): void
    {
        $this->importer(['lourd/20-greffier' => TwinSupport::GABARIT_GREFFIER]);
        $this->atelier('PUT', '/protocole/' . self::ENC, ['content' => 'Greffier FICTIF v2']);
        foreach ([
            ['PUT', '/protocole/' . self::ENC, ['content' => 'écrasement']],
            ['POST', '/protocole/' . self::ENC . '/restore', ['version' => 1]],
            ['POST', '/tester', ['name' => 'lourd/20-greffier', 'variables' => []]],
        ] as [$method, $path, $body]) {
            foreach ([[], ['X-CSRF-Token' => 'jeton-faux']] as $entetes) {
                $this->cookieSid = $this->atelier['sid'];
                $response = $this->request($method, '/api/twin9/admin' . $path, $body, $entetes);
                self::assertSame(403, $response->getStatusCode(), "$method $path");
                self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($response));
            }
        }
        self::assertSame('Greffier FICTIF v2', (string) self::$pdo->query("SELECT content FROM twin9_protocole WHERE name = 'lourd/20-greffier'")->fetchColumn());
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_protocole_versions')->fetchColumn());
    }

    #[TestDox('UC-PRO-08-F16 — ANOMALIES figées des noms : clé d’import purement numérique refusée (422) ; nom finissant par un saut de ligne accepté ; gabarit « …/versions » créé mais illisible dans l’atelier')]
    public function testF16NameEdgeCases(): void
    {
        // json_decode transforme la clé « 20 » en entier : refusée, bien que valide selon RG2.
        $numerique = $this->importer(['20' => 'Gabarit FICTIF numérique']);
        self::assertSame(422, $numerique->getStatusCode());
        self::assertSame(['error' => 'Fichier invalide : 20'], self::json($numerique));

        // NAME_PATTERN se termine par « $ » sans /D : un saut de ligne final passe.
        self::assertSame(['imported' => 1], self::json($this->importer(["lourd/20-greffier\n" => 'Gabarit FICTIF à saut de ligne'])));
        self::assertSame(["lourd/20-greffier\n"], self::$pdo->query('SELECT name FROM twin9_protocole')->fetchAll(\PDO::FETCH_COLUMN));

        // Un gabarit dont le dernier segment est « versions » est capté par la route
        // d'historique (enregistrée d'abord) : créé, mais jamais relu.
        $cree = $this->atelier('PUT', '/protocole/x%2Fversions', ['content' => 'Gabarit FICTIF masqué']);
        self::assertSame('created', self::json($cree)['status']);
        $lu = $this->atelier('GET', '/protocole/x%2Fversions');
        self::assertSame(404, $lu->getStatusCode());
        self::assertSame(['error' => 'Gabarit introuvable'], self::json($lu));
    }
}
