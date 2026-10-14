-- 023 — Interface ultime de cartographie : une version partagée PUBLIÉE PAR
-- UN CARTOGRAPHE, à la demande de l'apprenant, avec sa garantie (décision de
-- Christian du 2026-10-14, journal de la cartographie D-42).
--
-- L'apprenant adulte (attestation, 022) crée une DEMANDE : un code à usage
-- unique (10 caractères A-Z2-9, 30 jours) qu'il remet au cartographe de son
-- choix — le modèle des invitations (008). Avec ce code, un compte
-- cartographe (jamais l'apprenant lui-même) publie DANS LE COMPTE DE
-- L'APPRENANT une version partagée (cartographies.type 'partage', privée, sans
-- lien) et y pose sa garantie (cartography_garanties, 008 : nom figé, date) :
-- il se porte garant d'avoir vérifié ce que la personne a fait, ce que
-- l'analyse par IA a détecté et ce qu'en a vu le groupe classe. L'apprenant
-- décide seul de la partager (liens, 004/022) ; le cartographe n'intervient
-- plus. Remplacer soi-même une version garantie lui retire sa garantie.
--
-- RGPD : la demande appartient à l'apprenant (CASCADE) ; elle est consommée
-- (effacée) à la publication, annulable, effacée au retrait de l'attestation ;
-- une demande « à la place de » une version disparaît avec cette version
-- (CASCADE). Aucun contenu : un code, des dates, des identifiants.

CREATE TABLE carto_publication_requests (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    apprenant_id INT UNSIGNED NOT NULL,
    code CHAR(10) NOT NULL, -- alphabet A-Z2-9, generated server-side
    replaces_id INT UNSIGNED NULL DEFAULT NULL, -- NULL = a new version
    expires_at DATETIME NOT NULL, -- creation + 30 days
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_carto_publication_requests_code (code),
    KEY idx_carto_publication_requests_apprenant (apprenant_id),
    CONSTRAINT fk_carto_publication_requests_apprenant FOREIGN KEY (apprenant_id)
        REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_carto_publication_requests_replaces FOREIGN KEY (replaces_id)
        REFERENCES cartographies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
