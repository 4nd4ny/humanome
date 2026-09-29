<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Db;
use Humanome\Keys\KeyVault;
use Humanome\Llm\HttpClientException;
use Humanome\Llm\LlmRuntime;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\LlmFakeHttpClient;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\TwinSupport;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\FicheStore;
use Humanome\Twin9\ProtocoleRepository;
use Humanome\Twin9\Twin9Config;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-APP-10 — Lancer une analyse approfondie (Twin9) : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-10-analyse-approfondie-twin9.md
 *
 * Le moteur navigateur séquence des milliers de POST /api/twin9/appel ; ces
 * tests rejouent ces appels à travers l'API HTTP (Slim en processus, vraie
 * base MySQL), avec des gabarits et des fiches FICTIFS importés en base
 * comme en production, et l'amont Anthropic simulé (faux client HTTP).
 */
final class UcApp10AnalyseApprofondieTwin9Test extends CartographeTestCase
{
    private const JOURNEE = 'hier j’ai réparé la grande horloge du village avec mes deux mains nues ce matin';

    private LlmFakeHttpClient $http;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $apprenant;

    protected function setUp(): void
    {
        parent::setUp();
        $pdo = Db::get();
        $pdo->exec('DELETE FROM twin9_protocole_versions');
        $pdo->exec('DELETE FROM twin9_protocole');
        $pdo->exec("DELETE FROM settings WHERE name IN ('twin9_config', 'twin9_fiches', 'twin9_referentiel')");
        TestDb::setEnv('ANTHROPIC_API_KEY', TwinSupport::PLATFORM_KEY);
        TestDb::setEnv('SODIUM_MASTER_KEY', TwinSupport::MASTER_KEY_HEX);
        TestDb::setEnv('PAYPAL_CLIENT_ID', '');
        $this->http = new LlmFakeHttpClient();
        LlmRuntime::setHttpClient($this->http);

        // Précondition « import » (UC-PRO-08 A4) : gabarits, fiches et référentiel FICTIFS.
        $repo = new ProtocoleRepository($pdo);
        $repo->put('tagger/1-tag-pole', TwinSupport::GABARIT_TAG, null);
        $repo->put('lourd/20-greffier', TwinSupport::GABARIT_GREFFIER, null);
        $repo->put('lourd/21a-accusation', TwinSupport::GABARIT_TRIBUNAL, null);
        $settings = new SettingsRepository($pdo);
        FicheStore::store($settings, TwinSupport::fichesFictives());
        $config = new Twin9Config($settings);
        $config->setReferentiel(TwinSupport::referentielFictif());
        $config->update(['enabled' => true]);

        $this->apprenant = $this->registerAs('lea@example.org', 'Léa', ['apprenant']);
    }

    protected function tearDown(): void
    {
        LlmRuntime::setHttpClient(null);
        parent::tearDown();
    }

    /** Appel tel qu'envoyé par makeServerBackend (web/src/api/twin9.js). */
    private function appel(array $overrides = [], ?array $user = null): ResponseInterface
    {
        return $this->as_($user ?? $this->apprenant, 'POST', '/api/twin9/appel', array_merge([
            'etape' => 'tagger/1-tag-pole',
            'variables' => ['POLE_NUM' => 1, 'TEXTE_JOURNEE' => self::JOURNEE],
            'modele' => 'claude-sonnet-5',
            'etage' => 'taggers',
            'facturation' => 'platform',
            'max_tokens' => 1024,
        ], $overrides));
    }

    private function crediter(int $microusd, string $order = 'ORDER-UC-APP-10'): void
    {
        (new CreditService(Db::get()))->topup($this->apprenant['id'], $microusd, $order, 'Recharge PayPal');
    }

    private function solde(): int
    {
        return (new CreditService(Db::get()))->balance($this->apprenant['id']);
    }

    #[TestDox('UC-APP-10-F12 — nominal (API) : /meta sans contenu, puis appel greffier — fiche injectée serveur, sortie seule renvoyée, réserve réconciliée')]
    public function testF12NominalMetaThenBilledCall(): void
    {
        $this->crediter(5_000_000);

        // Étape 1-2 : ce que le client voit de Twin9 — noms, longueurs, variables. JAMAIS le contenu.
        $metaRaw = (string) $this->as_($this->apprenant, 'GET', '/api/twin9/meta')->getBody();
        $meta = json_decode($metaRaw, true);
        self::assertTrue($meta['enabled']);
        self::assertSame(['lourd/20-greffier', 'lourd/21a-accusation', 'tagger/1-tag-pole'], array_column($meta['etapes'], 'name'));
        self::assertSame(['COMPETENCE_FICHE', 'POLE_FICHES', 'CODE', 'EXTRAIT'], $meta['etapes'][0]['variables']);
        self::assertSame(mb_strlen(TwinSupport::GABARIT_GREFFIER), $meta['etapes'][0]['longueur_gabarit']);
        self::assertSame(5_000_000, $meta['solde_microusd']);
        self::assertSame('Pensée critique', $meta['referentiel'][0]['competences'][0]['nom']);
        foreach (['Greffier FICTIF', 'loutre', 'FICHE FICTIVE', 'PRÉAMBULE', 'fiche_md', 'marge'] as $secret) {
            self::assertStringNotContainsString($secret, $metaRaw);
        }

        // Étape 6 : un appel « rapide » ; le moteur n'envoie que les clés de lookup.
        TwinSupport::queueAnthropic($this->http, 'Dossier du greffier : pièce P1 retenue.', 800, 150);
        $response = $this->appel([
            'etape' => 'lourd/20-greffier',
            'variables' => ['CODE' => '1.01', 'EXTRAIT' => self::JOURNEE, 'POLE_NUM' => 1, 'POLE_FICHES_ORDRE' => ['1.02', '1.01']],
            'etage' => 'rapide',
        ]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $body = self::json($response);
        self::assertSame(['sortie', 'tokens_in', 'tokens_out', 'cout_microusd', 'stop_reason'], array_keys($body));
        self::assertSame('Dossier du greffier : pièce P1 retenue.', $body['sortie']);
        self::assertSame(2880 + 2700, $body['cout_microusd'], '⌈800×3×1,2⌉ + ⌈150×15×1,2⌉');

        // Rendu SERVEUR : gabarit + fiches confidentielles injectées, URL verrouillée.
        $upstream = $this->http->requests[0];
        self::assertSame('https://api.anthropic.com/v1/messages', $upstream['url']);
        $prompt = json_decode((string) $upstream['body'], true)['messages'][0]['content'];
        self::assertStringContainsString('Greffier FICTIF.', $prompt);
        self::assertStringContainsString('Fiche : ' . TwinSupport::FICHE_SECRETE, $prompt);
        self::assertStringContainsString("PRÉAMBULE FICTIF DU PÔLE 1\n\nFICHE FICTIVE 1.02", $prompt);
        self::assertStringNotContainsString('{$', $prompt);

        self::assertSame(5_000_000 - 5580, $this->solde());
        $labels = array_column((new CreditService(Db::get()))->events($this->apprenant['id']), 'label');
        self::assertSame(['lourd/20-greffier (réconciliation)', 'lourd/20-greffier (réserve)', 'Recharge PayPal'], $labels);
    }

    #[TestDox('UC-APP-10-F13 — nominal (API) : un fil d’appels sur les trois étages, chacun au tarif de SON modèle ; débit total = somme des coûts réels (scénario API seulement : la vue envoie un seul modèle, anomalie 4)')]
    public function testF13ThreeStagesThreeModels(): void
    {
        $this->crediter(5_000_000);
        TwinSupport::queueAnthropic($this->http, 'tags', 1000, 200, 'end_turn', 'claude-haiku-4-5-20251001');
        TwinSupport::queueAnthropic($this->http, 'dossier', 1000, 200);
        TwinSupport::queueAnthropic($this->http, 'réquisitoire', 1000, 200, 'end_turn', 'claude-opus-4-8');

        $couts = [
            self::json($this->appel(['modele' => 'claude-haiku-4-5-20251001', 'etage' => 'taggers']))['cout_microusd'],
            self::json($this->appel(['etape' => 'lourd/20-greffier', 'variables' => ['CODE' => '1.01', 'EXTRAIT' => 'x', 'POLE_NUM' => 1], 'etage' => 'rapide']))['cout_microusd'],
            self::json($this->appel(['etape' => 'lourd/21a-accusation', 'variables' => ['PIECES' => 'P1'], 'modele' => 'claude-opus-4-8', 'etage' => 'tribunal']))['cout_microusd'],
        ];
        self::assertSame([2400, 7200, 12000], $couts);
        self::assertSame(5_000_000 - 21600, $this->solde());
        $models = array_filter(array_column((new CreditService(Db::get()))->events($this->apprenant['id']), 'model'));
        self::assertSame(['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'], array_values(array_unique($models)));
    }

    #[TestDox('UC-APP-10-F14 — A2 / E6 : clé privée — 403 hors promo ; promo ouverte : 409 sans clé, puis 200 sans aucun débit, clé de l’apprenant sur le MÊME chemin')]
    public function testF14PrivateKeyLane(): void
    {
        $vault = new KeyVault(Db::get(), (string) KeyVault::masterKeyFromEnv());
        $vault->store($this->apprenant['id'], 'anthropic', 'sk-ant-perso-fictive');

        $ferme = $this->appel(['facturation' => 'cle_privee']);
        self::assertSame(403, $ferme->getStatusCode());
        self::assertStringContainsString('avec nos crédits', self::json($ferme)['error']);

        (new Twin9Config(new SettingsRepository(Db::get())))->update(['twin9_cle_perso_ouverte' => true]);
        $vault->delete($this->apprenant['id'], 'anthropic');
        $sansCle = $this->appel(['facturation' => 'cle_privee']);
        self::assertSame(409, $sansCle->getStatusCode());
        self::assertSame('Aucune clé Anthropic enregistrée pour votre compte', self::json($sansCle)['error']);

        $vault->store($this->apprenant['id'], 'anthropic', 'sk-ant-perso-fictive');
        TwinSupport::queueAnthropic($this->http, 'tags via clé privée', 500, 100);
        $ok = $this->appel(['facturation' => 'cle_privee']);
        self::assertSame(200, $ok->getStatusCode(), (string) $ok->getBody());
        self::assertSame(0, self::json($ok)['cout_microusd']);
        self::assertSame('sk-ant-perso-fictive', $this->http->requests[0]['headers']['x-api-key']);
        self::assertSame('https://api.anthropic.com/v1/messages', $this->http->requests[0]['url']);
        self::assertSame([], (new CreditService(Db::get()))->events($this->apprenant['id']), 'aucun mouvement au grand-livre');
        self::assertTrue(self::json($this->as_($this->apprenant, 'GET', '/api/twin9/meta'))['cle_privee_disponible']);
    }

    #[TestDox('UC-APP-10-F15 — E1 : sans session → 401 sur /appel et /meta, aucun appel amont')]
    public function testF15RequiresSession(): void
    {
        $this->cookieSid = null;
        self::assertSame(401, $this->request('POST', '/api/twin9/appel', ['etape' => 'tagger/1-tag-pole'])->getStatusCode());
        self::assertSame(401, $this->request('GET', '/api/twin9/meta')->getStatusCode());
        self::assertSame([], $this->http->requests);
    }

    #[TestDox('UC-APP-10-F16 — E2 : Twin9 désactivé → /appel 503 « Twin9 non disponible », /meta enabled=false')]
    public function testF16DisabledService(): void
    {
        (new Twin9Config(new SettingsRepository(Db::get())))->setEnabled(false);
        $this->crediter(5_000_000);
        $response = $this->appel();
        self::assertSame(503, $response->getStatusCode());
        self::assertSame(['error' => 'Twin9 non disponible'], self::json($response));
        self::assertFalse(self::json($this->as_($this->apprenant, 'GET', '/api/twin9/meta'))['enabled']);
        self::assertSame([], $this->http->requests);
        self::assertSame(5_000_000, $this->solde());
    }

    #[TestDox('UC-APP-10-F17 — E7 : requêtes invalides (400/413/422/404, 403 sans jeton CSRF) refusées avant tout débit, sans le moindre fragment de gabarit')]
    public function testF17InvalidRequestsNeverLeakNorBill(): void
    {
        $this->crediter(5_000_000);
        $cases = [
            [['etape' => ''], 422, 'Champ requis : etape'],
            [['variables' => 'texte'], 422, 'Champ variables invalide : objet attendu'],
            [['variables' => ['X' => ['imbrique' => ['a']]]], 422, 'Variable invalide (scalaire ou liste attendu) : X'],
            [['etage' => 'grenier'], 422, 'Étage inconnu (taggers, rapide, tribunal)'],
            [['modele' => 'claude-opus-4-8', 'etage' => 'taggers'], 422, 'Modèle non proposé pour cet étage'],
            [['max_tokens' => 12.5], 422, 'Champ max_tokens invalide : entier attendu'],
            [['facturation' => 'gratuit'], 422, 'Champ facturation invalide (platform ou cle_privee)'],
            [['etape' => 'fictif/inconnu'], 404, 'Gabarit introuvable'],
            [['variables' => ['POLE_NUM' => 1]], 422, 'Variables non résolues'],
        ];
        foreach ($cases as [$overrides, $status, $message]) {
            $response = $this->appel($overrides);
            $raw = (string) $response->getBody();
            self::assertSame($status, $response->getStatusCode(), $raw);
            self::assertSame($message, self::json($response)['error']);
            self::assertStringNotContainsString('loutre', $raw);
            self::assertStringNotContainsString('FICTIF', $raw);
        }
        // Variables non résolues : les NOMS seulement.
        self::assertSame(['TEXTE_JOURNEE'], self::json($this->appel(['variables' => ['POLE_NUM' => 1]]))['variables']);

        self::assertSame(413, $this->appel(['variables' => ['POLE_NUM' => 1, 'TEXTE_JOURNEE' => str_repeat('a', 310 * 1024)]])->getStatusCode());
        $raw = TwinSupport::rawRequest('POST', '/api/twin9/appel', '[1, 2', $this->apprenant['sid'], $this->apprenant['csrf']);
        self::assertSame(400, $raw->getStatusCode());

        // Session valide mais jeton CSRF absent : refusé AVANT la route.
        $corpsValide = json_encode([
            'etape' => 'tagger/1-tag-pole',
            'variables' => ['POLE_NUM' => 1, 'TEXTE_JOURNEE' => self::JOURNEE],
            'modele' => 'claude-sonnet-5',
            'etage' => 'taggers',
            'facturation' => 'platform',
        ], JSON_THROW_ON_ERROR);
        $sansJeton = TwinSupport::rawRequest('POST', '/api/twin9/appel', $corpsValide, $this->apprenant['sid'], null);
        self::assertSame(403, $sansJeton->getStatusCode());
        self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($sansJeton));

        self::assertSame([], $this->http->requests);
        self::assertSame(5_000_000, $this->solde());
    }

    #[TestDox('UC-APP-10-F18 — E4 / E5 : réserve pire-cas non couverte → 402 (montants), amont jamais appelé, solde intact')]
    public function testF18InsufficientBalance(): void
    {
        $response = $this->appel();
        self::assertSame(402, $response->getStatusCode());
        self::assertSame(0, self::json($response)['solde_microusd']);

        $this->crediter(1_000);
        $body = self::json($this->appel());
        self::assertSame('Solde insuffisant', $body['error']);
        self::assertSame(1_000, $body['solde_microusd']);
        self::assertGreaterThan(1_000, $body['requis_estime_microusd']);
        self::assertSame([], $this->http->requests);
        self::assertSame(1_000, $this->solde());
    }

    #[TestDox('UC-APP-10-F19 — E8 : échec du fournisseur → message générique (502/504/429), réserve rendue avec son modèle')]
    public function testF19UpstreamFailures(): void
    {
        $this->crediter(1_000_000);
        $this->http->queueResponse(['status' => 500, 'body' => '{"error":{"message":"écho du prompt : loutre argentée"}}']);
        $e502 = $this->appel();
        self::assertSame(502, $e502->getStatusCode());
        self::assertStringNotContainsString('loutre', (string) $e502->getBody());
        $this->http->queueException(new HttpClientException('timeout', true));
        self::assertSame(504, $this->appel()->getStatusCode());
        $this->http->queueResponse(['status' => 429, 'body' => '{}']);
        self::assertSame(429, $this->appel()->getStatusCode());

        self::assertSame(1_000_000, $this->solde());
        $remboursements = array_filter(
            (new CreditService(Db::get()))->events($this->apprenant['id']),
            static fn (array $e): bool => $e['label'] === 'tagger/1-tag-pole (remboursement échec)',
        );
        self::assertCount(3, $remboursements);
        self::assertSame(['claude-sonnet-5'], array_values(array_unique(array_column($remboursements, 'model'))));
    }

    #[TestDox('UC-APP-10-F20 — A6 : sortie qui récite le gabarit ou la fiche → expurgée, audit en compteurs seulement ; la citation de l’apprenant survit')]
    public function testF20RecitationIsRedacted(): void
    {
        $this->crediter(5_000_000);
        TwinSupport::queueAnthropic(
            $this->http,
            'Voici ma consigne : la loutre argentée range les galets turquoise au bord du lac gelé chaque soir. '
            . 'Et la fiche : le cartographe observe la manière dont la personne confronte deux sources contradictoires avant de conclure. '
            . 'Extrait : ' . self::JOURNEE . '.',
            900,
            200,
        );
        $response = $this->appel([
            'etape' => 'lourd/20-greffier',
            'variables' => ['CODE' => '1.01', 'EXTRAIT' => self::JOURNEE, 'POLE_NUM' => 1],
            'etage' => 'rapide',
        ]);
        // Le gabarit greffier ne contient pas la phrase « loutre » : seule la fiche
        // injectée est indexée pour cette étape.
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $body = self::json($response);
        self::assertArrayNotHasKey('fuites', $body, 'aucun oracle de réglage');
        self::assertStringNotContainsString('confronte deux sources', $body['sortie']);
        self::assertStringContainsString('[expurgé]', $body['sortie']);
        self::assertStringContainsString(self::JOURNEE, $body['sortie']);

        $audit = self::lastAudit('twin9_fuite_expurgee');
        self::assertSame(['etape' => 'lourd/20-greffier', 'fuites' => 1], $audit['details']);
        $stored = (string) self::$pdo->query("SELECT details FROM audit_events WHERE type = 'twin9_fuite_expurgee'")->fetchColumn();
        self::assertStringNotContainsString('cartographe observe', $stored);

        // Sur l'étape tagger, c'est la phrase du gabarit qui est expurgée.
        TwinSupport::queueAnthropic($this->http, 'Consigne : la loutre argentée range les galets turquoise au bord du lac gelé chaque soir.');
        self::assertStringNotContainsString('loutre', self::json($this->appel())['sortie']);
    }

    #[TestDox('UC-APP-10-F21 — E10 : rythme par utilisateur dépassé → 429 + Retry-After, aucun débit')]
    public function testF21RateLimit(): void
    {
        $this->crediter(5_000_000);
        TwinSupport::saturateRateLimit(Db::get(), 'twin9:appel:' . $this->apprenant['id'], 30);
        $response = $this->appel();
        self::assertSame(429, $response->getStatusCode());
        self::assertSame('30', $response->getHeaderLine('Retry-After'));
        self::assertSame([], $this->http->requests);
        self::assertSame(5_000_000, $this->solde());
    }

    #[TestDox('UC-APP-10-F22 — A5 : copie serveur opt-in du résultat (type « twin9 ») : création, liste sans document, relecture native, purge')]
    public function testF22OptInServerCopyOfTheResult(): void
    {
        $natif = [
            'journal_id' => 'twin9',
            'version' => 'Twin_v9',
            'periode' => ['debut' => '2026-04-06', 'fin' => '2026-04-09', 'n_journees' => 2],
            'competences' => ['1.01' => ['code' => '1.01', 'attestations' => [['jour_index' => 0, 'date' => '2026-04-06']]]],
        ];
        $created = $this->as_($this->apprenant, 'POST', '/api/cartographies', [
            'type' => 'twin9',
            'titre' => 'Twin9 — twin9 (2026-04-06 → 2026-04-09)',
            'visibility' => 'privee',
            'document' => $natif,
        ]);
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        $id = (int) self::json($created)['id'];

        $liste = self::json($this->as_($this->apprenant, 'GET', '/api/cartographies'));
        self::assertSame('twin9', $liste[0]['type']);
        self::assertArrayNotHasKey('document', $liste[0]);

        $lu = self::json($this->as_($this->apprenant, 'GET', '/api/cartographies/' . $id));
        self::assertEquals($natif, $lu['document']);
        self::assertNotNull($lu['optInAt'], 'le POST est l’opt-in daté');

        self::assertSame(204, $this->as_($this->apprenant, 'DELETE', '/api/cartographies/' . $id)->getStatusCode());
        self::assertSame(404, $this->as_($this->apprenant, 'GET', '/api/cartographies/' . $id)->getStatusCode());
        // Purge RÉELLE : la ligne a disparu de la base (pas une suppression logique).
        $reste = self::$pdo->prepare('SELECT COUNT(*) FROM cartographies WHERE id = ?');
        $reste->execute([$id]);
        self::assertSame(0, (int) $reste->fetchColumn());
    }

    #[TestDox('UC-APP-10-F23 — E11 : service non configuré → 503 (clé plateforme absente ; clé maître absente en voie clé privée)')]
    public function testF23ServiceNotConfigured(): void
    {
        $this->crediter(5_000_000);
        TestDb::setEnv('ANTHROPIC_API_KEY', '');
        $plateforme = $this->appel();
        self::assertSame(503, $plateforme->getStatusCode());
        self::assertSame(['error' => 'Service indisponible'], self::json($plateforme));

        (new Twin9Config(new SettingsRepository(Db::get())))->update(['twin9_cle_perso_ouverte' => true]);
        TestDb::setEnv('SODIUM_MASTER_KEY', '');
        $response = $this->appel(['facturation' => 'cle_privee']);
        self::assertSame(503, $response->getStatusCode());
        self::assertSame('Stockage de clés non configuré', self::json($response)['error']);
        self::assertSame([], $this->http->requests);
        self::assertSame(5_000_000, $this->solde());
    }

    #[TestDox('UC-APP-10-F24 — ANOMALIE figée : un journal qui contient littéralement « {$PRENOM} » bloque l’appel (422 « Variables non résolues »)')]
    public function testF24PlaceholderLookingJournalTextBlocksTheCall(): void
    {
        $this->crediter(5_000_000);
        $response = $this->appel(['variables' => [
            'POLE_NUM' => 1,
            'TEXTE_JOURNEE' => 'Atelier prompts : j’ai écrit un gabarit « Bonjour {$PRENOM} » pour la classe.',
        ]]);

        // Comportement ACTUEL : le motif présent dans la VALEUR est pris pour une
        // variable du gabarit non résolue ; aucun appel amont, rien débité.
        self::assertSame(422, $response->getStatusCode());
        self::assertSame(['error' => 'Variables non résolues', 'variables' => ['PRENOM']], self::json($response));
        self::assertSame([], $this->http->requests);
        self::assertSame(5_000_000, $this->solde());
    }
}
