<?php

declare(strict_types=1);

namespace Humanome\Tests;

use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Routes HTTP des compétences ATOMIQUES : lectures publiques, cycle
 * fork→édition(CAS If-Match)→vote→entérinement par compétence, et autorisation
 * (toute mutation derrière le rôle épistémiarque ; le vote réservé aux membres).
 */
final class CompetenceApiTest extends CompetenceTestCase
{
    public function testPublicListAndDetail(): void
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        self::seedCompetence('2.01', 'Écoute', 2);

        $list = self::body($this->request('GET', '/competences'));
        self::assertSame(['1.01', '2.01'], array_column($list, 'code'));

        $detail = self::body($this->request('GET', '/competences/1.01'));
        self::assertSame('Pensée Critique', $detail['nom']);
        self::assertSame('1.01', $detail['content']['identite']['code']);
    }

    public function testForkEditVotePublishCycle(): void
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        self::loginAs(self::createUser('epistemiarque'));

        // Fork
        $draft = self::body($this->request('POST', '/competences/1.01/drafts', ['semver' => '1.1.0']));
        self::assertSame('draft', $draft['status']);
        $id = $draft['id'];
        $baseHash = $draft['contentHash'];

        // Édition avec If-Match
        $content = $draft['content'];
        $content['identite']['definition'] = 'Définition enrichie';
        $saved = self::body($this->requestWithHeaders('PUT', "/competences/drafts/{$id}", $content, ['If-Match' => $baseHash]));
        self::assertSame('Définition enrichie', $saved['content']['identite']['definition']);
        self::assertNotSame($baseHash, $saved['contentHash']);

        // Soumission + vote + publication (électorat = 1, seuil 1)
        self::assertSame(200, $this->request('POST', "/competences/drafts/{$id}/submit")->getStatusCode());
        $voted = self::body($this->request('POST', "/competences/proposals/{$id}/votes", ['vote' => 'pour']));
        self::assertTrue($voted['tally']['reached']);
        $published = $this->request('POST', "/competences/drafts/{$id}/publish", ['releaseNote' => 'ok']);
        self::assertSame(200, $published->getStatusCode());
        self::assertSame('published', self::body($published)['status']);

        // La dernière publiée de 1.01 est désormais 1.1.0.
        self::assertSame('1.1.0', self::body($this->request('GET', '/competences/1.01'))['semver']);
    }

    public function testPutWithoutIfMatchIs428(): void
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        self::loginAs(self::createUser('epistemiarque'));
        $draft = self::body($this->request('POST', '/competences/1.01/drafts', ['semver' => '1.1.0']));

        $response = $this->request('PUT', "/competences/drafts/{$draft['id']}", $draft['content']);
        self::assertSame(428, $response->getStatusCode());
    }

    public function testStaleIfMatchIs409(): void
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        self::loginAs(self::createUser('epistemiarque'));
        $draft = self::body($this->request('POST', '/competences/1.01/drafts', ['semver' => '1.1.0']));
        $id = $draft['id'];

        $c1 = $draft['content'];
        $c1['identite']['definition'] = 'A';
        $this->requestWithHeaders('PUT', "/competences/drafts/{$id}", $c1, ['If-Match' => $draft['contentHash']]);

        // Deuxième écriture avec le hash de base PÉRIMÉ -> 409.
        $c2 = $draft['content'];
        $c2['identite']['definition'] = 'B';
        $response = $this->requestWithHeaders('PUT', "/competences/drafts/{$id}", $c2, ['If-Match' => $draft['contentHash']]);
        self::assertSame(409, $response->getStatusCode());
    }

    /** @return array<string, array{0:string, 1:string, 2: array<string,mixed>|null}> */
    public static function mutatingRoutes(): array
    {
        return [
            'fork draft' => ['POST', '/competences/1.01/drafts', ['semver' => '1.1.0']],
            'update draft' => ['PUT', '/competences/drafts/1', null],
            'submit' => ['POST', '/competences/drafts/1/submit', null],
            'withdraw' => ['POST', '/competences/drafts/1/withdraw', null],
            'publish' => ['POST', '/competences/drafts/1/publish', null],
            'vote' => ['POST', '/competences/proposals/1/votes', ['vote' => 'pour']],
            'release' => ['POST', '/competences/release', ['semver' => '7.2.0']],
        ];
    }

    /** @param array<string,mixed>|null $body */
    #[DataProvider('mutatingRoutes')]
    public function testMutationsRejectAnonymous(string $method, string $path, ?array $body): void
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        self::assertSame(401, $this->request($method, $path, $body)->getStatusCode());
    }

    /** @param array<string,mixed>|null $body */
    #[DataProvider('mutatingRoutes')]
    public function testMutationsRejectNonEpistemiarque(string $method, string $path, ?array $body): void
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        self::loginAs(self::createUser('apprenant', 'cartographe'));
        self::assertSame(403, $this->request($method, $path, $body)->getStatusCode());
    }
}
