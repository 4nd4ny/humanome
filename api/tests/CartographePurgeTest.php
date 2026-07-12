<?php

declare(strict_types=1);

namespace Humanome\Tests;

/**
 * P9 x RGPD (cahier §6.3): account deletion against the migration-008
 * tables. Two directions:
 *   - the CARTOGRAPHE purges: links, HIS annotations and HIS garantie go;
 *     the learner keeps the revisions (anonymized) and their own data;
 *   - the APPRENANT purges: cartographies cascade and take annotations,
 *     revisions and garanties with them; invitations and links vanish.
 */
final class CartographePurgeTest extends CartographeTestCase
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $maya;
    /** @var array{id: int, csrf: string, sid: string} */
    private array $carl;
    private int $cartoId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->maya = $this->registerAs('maya@example.org', 'Maya');
        $this->carl = $this->registerAs('carl@example.org', 'Carl', ['cartographe']);
        $this->link($this->maya, $this->carl);
        $this->cartoId = $this->createCarto($this->maya);

        // Populate the whole review surface through the API itself.
        self::assertSame(201, $this->as_($this->maya, 'POST', '/api/cartographies/' . $this->cartoId . '/annotations', [
            'competenceCode' => '1.01', 'type' => 'commentaire', 'texte' => 'Note de Maya.',
        ])->getStatusCode());
        self::assertSame(201, $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/annotations', [
            'competenceCode' => '2.02', 'type' => 'oubli', 'texte' => 'Note de Carl.',
        ])->getStatusCode());
        $revisionId = (int) self::json($this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
            'document' => self::jourDocument(), 'note' => 'Corrigée par Carl',
        ]))['revisionId'];
        self::assertSame(201, $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/garantie', [
            'revisionId' => $revisionId,
        ])->getStatusCode());
        // One pending invitation on Maya's side too.
        self::assertSame(201, $this->as_($this->maya, 'POST', '/api/cartographe/invitations')->getStatusCode());
    }

    private function countRows(string $sql): int
    {
        return (int) self::$pdo->query($sql)->fetchColumn();
    }

    public function testCartographePurgeRemovesHisTracesButKeepsTheLearnersHistory(): void
    {
        $deleted = $this->as_($this->carl, 'DELETE', '/api/auth/account');
        self::assertSame(204, $deleted->getStatusCode());

        // Link gone; Carl's annotation gone; his garantie gone.
        self::assertSame(0, $this->countRows('SELECT COUNT(*) FROM cartographe_links'));
        self::assertSame(0, $this->countRows(
            'SELECT COUNT(*) FROM cartography_annotations WHERE author_id = ' . $this->carl['id']
        ));
        self::assertSame(0, $this->countRows('SELECT COUNT(*) FROM cartography_garanties'));

        // The learner's world survives: her cartography, her annotation, and
        // the corrected revision — anonymized (author SET NULL).
        self::assertSame(1, $this->countRows('SELECT COUNT(*) FROM cartographies'));
        self::assertSame(1, $this->countRows('SELECT COUNT(*) FROM cartography_annotations'));
        self::assertSame(1, $this->countRows('SELECT COUNT(*) FROM cartography_revisions'));
        self::assertSame(1, $this->countRows('SELECT COUNT(*) FROM cartography_revisions WHERE author_id IS NULL'));

        // The invitation record survives on Maya's side, accepter anonymized.
        self::assertSame(0, $this->countRows(
            'SELECT COUNT(*) FROM cartographe_invitations WHERE accepted_by IS NOT NULL'
        ));

        // Maya sees the anonymized revision through the API.
        $meta = self::json($this->as_($this->maya, 'GET', '/api/cartographies/' . $this->cartoId . '/revisions'));
        self::assertCount(1, $meta);
        self::assertNull($meta[0]['author']);
        self::assertNull(self::json($this->as_($this->maya, 'GET', '/api/cartographe/invitations'))[1]['acceptedBy'] ?? null);
    }

    public function testApprenantPurgeCascadesTheWholeReviewSurface(): void
    {
        $deleted = $this->as_($this->maya, 'DELETE', '/api/auth/account');
        self::assertSame(204, $deleted->getStatusCode());

        foreach ([
            'cartographies',
            'cartographe_invitations',
            'cartographe_links',
            'cartography_annotations',
            'cartography_revisions',
            'cartography_garanties',
        ] as $table) {
            self::assertSame(0, $this->countRows('SELECT COUNT(*) FROM ' . $table), $table . ' must be purged');
        }

        // Carl's account is untouched, his queue is simply empty.
        self::assertSame([], self::json($this->as_($this->carl, 'GET', '/api/cartographe/apprentis')));
        self::assertSame([], self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies')));

        // Audit stays, anonymized (user_id SET NULL) — dated facts, no content.
        $garantiePosee = self::lastAudit('garantie_posee');
        self::assertNotNull($garantiePosee, 'audit events survive the purge');
    }
}
