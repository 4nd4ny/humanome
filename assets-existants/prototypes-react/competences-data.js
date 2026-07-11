// competences-data.js
// Données de compétences issues du Référentiel Global pour l'Ère Post-AGI v2.0
// Ces données représentent un portfolio étudiant fictif pour démonstration

const domainsData = [
    {
        id: "A. Cognition & Métacognition",
        color: "#2563eb",
        competences: [
            {
                id: "A1 - Pensée critique",
                points: 92,
                niveau: 5,
                description: "Évaluer, analyser et déconstruire l'information de manière critique. Identifier les biais, déconstruire les arguments, détecter les sophismes et hallucinations d'IA.",
                feedback: `<p>L'étudiant·e a démontré une <strong>maîtrise exceptionnelle</strong> de la pensée critique tout au long du semestre. Son travail d'analyse des outputs d'IA générative dans le projet « Fact-checking 2.0 » constitue un exemple remarquable de cette compétence en action.</p>
                <p>En particulier, sa capacité à <em>déconstruire les présupposés épistémologiques</em> des modèles de langage s'est révélée d'une grande finesse. Dans son essai « Les angles morts de GPT » (Portfolio, Section A, p.12-18), l'analyse des hallucinations est non seulement rigoureuse mais ouvre des pistes méthodologiques originales.</p>
                <h4>Points forts observés :</h4>
                <ul>
                    <li>Identification systématique des biais de confirmation dans les sources médiatiques</li>
                    <li>Création d'une grille d'évaluation des sophismes adaptée au contexte numérique</li>
                    <li>Capacité à maintenir le doute méthodique sans tomber dans le relativisme</li>
                </ul>
                <p><strong>Prochaine étape suggérée :</strong> Approfondir le travail sur les <em>biais systémiques</em> dans les datasets d'entraînement des IA, un domaine où cette pensée critique pourrait s'épanouir davantage.</p>`
            },
            {
                id: "A2 - Résolution problèmes",
                points: 78,
                niveau: 4,
                description: "Aborder et résoudre des défis multidimensionnels. Décomposer les problèmes 'Wicked', gérer les contraintes contradictoires, modéliser les systèmes complexes.",
                feedback: `<p>Face au projet « Transition énergétique locale », l'étudiant·e a su naviguer avec habileté dans un <strong>environnement à contraintes multiples et contradictoires</strong>. La modélisation du système énergétique du quartier (voir schéma interactif, Portfolio Section A2) témoigne d'une réelle capacité à penser les interdépendances.</p>
                <p>Le travail de décomposition du problème en sous-systèmes gérables était particulièrement impressionnant. L'utilisation de la méthode des <em>« Leverage Points »</em> de Donella Meadows pour identifier les points d'intervention à fort impact montre une appropriation solide des outils de pensée systémique.</p>
                <h4>Analyse de la progression :</h4>
                <p>En début de semestre, l'étudiant·e avait tendance à chercher « LA » solution optimale. Au fil des itérations, une posture plus mature a émergé : <strong>accepter que certains problèmes ne se « résolvent » pas mais se « naviguent »</strong>.</p>
                <p>Le rapport final montre une belle anticipation des effets de second ordre, notamment sur les impacts sociaux de la tarification dynamique de l'énergie. Un point de vigilance : la gestion du temps sous pression reste à consolider — le prototype final a été livré 48h après le délai initial.</p>`
            },
            {
                id: "A4 - Métacognition",
                points: 55,
                niveau: 3,
                description: "Conscience et gestion de ses propres processus cognitifs. Identifier ses modes d'apprentissage, reconnaître ses biais, optimiser ses stratégies.",
                feedback: `<p>Le journal d'apprentissage tenu tout au long du semestre révèle une <strong>prise de conscience croissante</strong> des processus cognitifs personnels. L'étudiant·e a identifié avec lucidité son mode d'apprentissage préférentiel (fortement visuel-spatial) et a commencé à adapter ses stratégies en conséquence.</p>
                <p>L'auto-évaluation intermédiaire (semaine 8) démontre une honnêteté remarquable : <em>« Je réalise que je confonds souvent rapidité et efficacité. Quand je vais vite, je dois ensuite revenir en arrière. »</em></p>
                <h4>Axe de développement principal :</h4>
                <p>La reconnaissance des biais cognitifs personnels est encore en développement. L'étudiant·e identifie bien les biais <em>chez les autres</em> mais peine à reconnaître ses propres angles morts en temps réel. Exercice suggéré : tenir un « journal des décisions » pendant 30 jours pour tracker les moments de certitude excessive.</p>
                <p><strong>Ressource recommandée :</strong> <em>« Thinking, Fast and Slow »</em> de Kahneman, en particulier les chapitres sur l'illusion de validité et l'excès de confiance.</p>`
            },
            {
                id: "A5 - Pensée systémique",
                points: 85,
                niveau: 4,
                description: "Comprendre les interconnexions et dynamiques globales. Visualiser les boucles de rétroaction, analyser les effets de bord, naviguer les systèmes complexes adaptatifs.",
                feedback: `<p>La cartographie systémique réalisée dans le cadre du projet « Écosystème de la désinformation » constitue l'une des <strong>productions les plus abouties</strong> de la cohorte. L'identification des boucles de rétroaction entre algorithmes de recommandation, économie de l'attention et polarisation politique démontre une compréhension fine des dynamiques non-linéaires.</p>
                <p>Particulièrement remarquable : la capacité à <em>naviguer sans chercher le contrôle total</em>. Lors de la restitution orale, l'étudiant·e a explicitement refusé de proposer une « solution » unique, préférant identifier des <strong>points de levier multiples et adaptables</strong>.</p>
                <h4>Éléments du portfolio à valoriser :</h4>
                <ul>
                    <li>Diagramme causal à 47 nœuds avec identification des délais temporels</li>
                    <li>Simulation agent-based sur NetLogo (10 000 itérations)</li>
                    <li>Analyse des propriétés émergentes observées vs. prédites</li>
                </ul>
                <p>Point de progression : l'anticipation des <em>propriétés émergentes imprévisibles</em> reste un défi. L'étudiant·e a été surpris par certains comportements du modèle simulé.</p>`
            },
            {
                id: "A6 - Pensée computationnelle",
                points: 62,
                niveau: 3,
                description: "Raisonnement algorithmique et systématique. Comprendre la logique de programmation, décomposer en séquences, concevoir des algorithmes.",
                feedback: `<p>L'étudiant·e démontre une <strong>compréhension solide des fondamentaux</strong> de la pensée computationnelle. La capacité à décomposer un problème en étapes séquentielles est bien établie, comme en témoigne le pseudo-code du système de recommandation éthique (Portfolio, Section C).</p>
                <p>La reconnaissance des patterns et abstractions réutilisables progresse : l'étudiant·e a spontanément identifié que trois projets différents partageaient une structure algorithmique commune (parcours d'arbre), ce qui a permis de réutiliser du code.</p>
                <h4>Zone de développement proximal :</h4>
                <p>La distinction entre approches <em>déterministes et probabilistes</em> nécessite un approfondissement. Lors du module sur les LLM, l'étudiant·e a exprimé une certaine confusion face au caractère « non-déterministe » des outputs. Ce n'est pas un blocage mais un seuil d'apprentissage à franchir.</p>
                <p><strong>Exercice pratique suggéré :</strong> Implémenter un même algorithme de tri en Python et en SQL pour expérimenter les différents paradigmes (impératif vs. déclaratif).</p>`
            },
            {
                id: "A3.6 - Innovation transgressive",
                points: 35,
                niveau: 2,
                description: "Innover en violant délibérément les règles établies ou les patterns algorithmiques. Transcender les limites de la créativité probabiliste.",
                feedback: `<p>Cette compétence est <strong>en cours d'émergence</strong>. L'étudiant·e montre une excellente maîtrise des cadres établis, mais hésite encore à les transgresser délibérément.</p>
                <p>Lors de l'atelier de créativité « Brisez les règles », une réticence initiale était visible : <em>« Mais si je fais ça, ça ne marchera pas selon les critères d'évaluation... »</em>. Cette remarque révèle un conditionnement à l'optimisation des métriques qui peut freiner l'innovation de rupture.</p>
                <h4>Pistes de développement :</h4>
                <p>L'innovation transgressive requiert de <strong>distinguer les règles techniques (contraintes physiques) des règles sociales (conventions modifiables)</strong>. Un exercice utile serait de lister les « règles » implicites d'un domaine et de les classer selon leur degré de négociabilité.</p>
                <p>Le projet de fin d'année pourrait être l'occasion d'expérimenter cette posture : proposer une solution qui <em>viole explicitement</em> une best practice établie, tout en justifiant pourquoi cette transgression est fertile dans le contexte spécifique.</p>`
            }
        ]
    },
    {
        id: "B. Relations & Collaboration",
        color: "#10b981",
        competences: [
            {
                id: "B1 - Intelligence émotionnelle",
                points: 88,
                niveau: 4,
                description: "Conscience et gestion des émotions propres et d'autrui. Lucidité émotionnelle, régulation, reconnaissance des signaux, création d'environnements sécurisants.",
                feedback: `<p>L'étudiant·e a fait preuve d'une <strong>intelligence émotionnelle remarquable</strong> tout au long de l'année, particulièrement visible lors des phases de tension du projet de groupe.</p>
                <p>La capacité de <em>co-régulation émotionnelle</em> a été déterminante lors de la semaine 11, quand deux membres de l'équipe sont entrés en conflit ouvert sur les choix techniques. L'étudiant·e a su créer un espace de dialogue sécurisant, permettant à chacun d'exprimer ses frustrations sans escalade.</p>
                <h4>Observation clé (évaluation 360°) :</h4>
                <blockquote style="border-left: 3px solid #10b981; padding-left: 12px; margin: 12px 0; font-style: italic;">
                    « Quand l'ambiance devient tendue, [prénom] arrive à nommer ce qui se passe sans accuser personne. Ça désamorce les situations. » — Pair du projet Alpha
                </blockquote>
                <p>La reconnaissance des micro-expressions s'est affinée : le journal de bord documente plusieurs moments où l'étudiant·e a détecté un malaise non-verbalisé chez un collègue et a agi préventivement.</p>
                <p><strong>Axe d'approfondissement :</strong> Explorer le concept de « marqueur somatique » (Damasio) — utiliser davantage les sensations corporelles comme source d'information décisionnelle.</p>`
            },
            {
                id: "B2 - Empathie & compassion",
                points: 75,
                niveau: 4,
                description: "Comprendre et ressentir avec l'autre. Écoute active radicale, changement de perspective authentique, compassion opérationnelle sans épuisement.",
                feedback: `<p>L'écoute active déployée lors des interviews utilisateurs du projet UX démontre une <strong>réelle capacité empathique</strong>. Les verbatims collectés et leur traduction en besoins fonctionnels témoignent d'une compréhension profonde du vécu des utilisateurs.</p>
                <p>L'étudiant·e excelle dans le <em>changement de perspective</em> : lors du jeu de rôle « Avocat du diable », sa défense d'une position qu'il·elle désapprouvait personnellement était convaincante et nuancée, signe d'une empathie cognitive mature.</p>
                <h4>Point de vigilance identifié :</h4>
                <p>Un risque de <strong>fatigue compassionnelle</strong> a été observé en fin de semestre. L'engagement empathique intense auprès de l'équipe a parfois conduit à négliger ses propres besoins. L'entrée du journal du 15 novembre est révélatrice : <em>« Je passe tellement de temps à écouter les autres que je n'ai plus d'énergie pour mon propre travail. »</em></p>
                <p><strong>Ressource suggérée :</strong> Travail sur la notion de « compassion avec limites » — être présent à l'autre sans se perdre. La pratique RAIN (Recognize, Allow, Investigate, Nurture) pourrait être utile.</p>`
            },
            {
                id: "B3 - Collaboration hybride",
                points: 70,
                niveau: 3,
                description: "Collaborer au sein d'équipes mixtes Humains/IA. Coopérer avec des profils variés, co-créer avec l'IA générative, intégrer des agents autonomes dans les workflows.",
                feedback: `<p>L'intégration des outils d'IA dans le flux de travail collaboratif montre une <strong>progression significative</strong>. L'étudiant·e a su dépasser l'usage individuel pour explorer les potentialités de la <em>co-création en temps réel</em>.</p>
                <p>Le projet « Brainstorm augmenté » illustre bien cette évolution : utilisation de Claude comme « troisième participant » lors des sessions d'idéation, avec des règles d'interaction clairement définies (quand solliciter l'IA, comment challenger ses propositions).</p>
                <h4>Analyse des pratiques documentées :</h4>
                <ul>
                    <li><strong>Point fort :</strong> Excellente supervision « Human-in-the-loop » — sait quand reprendre la main</li>
                    <li><strong>En développement :</strong> L'orchestration de plusieurs agents IA simultanés reste hésitante</li>
                    <li><strong>À explorer :</strong> La collaboration asynchrone avec des outils IA persistants</li>
                </ul>
                <p>L'équipe a noté une tension initiale : certain·e·s membres voyaient l'IA comme une « menace » plutôt qu'un outil. L'étudiant·e a joué un rôle de médiateur pour faire évoluer cette perception.</p>`
            },
            {
                id: "B4 - Communication authentique",
                points: 58,
                niveau: 3,
                description: "Expression claire et connexion véritable. Communication intermodale, assertivité, adaptation au contexte, transparence radicale, facilitation des dialogues difficiles.",
                feedback: `<p>La communication écrite est <strong>claire et structurée</strong>. Les rapports produits sont bien organisés et les arguments sont présentés avec logique. La maîtrise de la communication visuelle (infographies, schémas) est également solide.</p>
                <p>L'assertivité progresse : l'étudiant·e exprime désormais ses désaccords plus ouvertement, là où il·elle avait tendance à se conformer silencieusement en début d'année.</p>
                <h4>Zone de développement prioritaire :</h4>
                <p>L'adaptation du <em>registre de communication au contexte</em> reste un défi. Lors de la soutenance devant le jury externe (incluant des non-experts), le niveau de technicité était trop élevé. Retour du jury : <em>« Les slides sont impressionnantes mais j'ai décroché au bout de 5 minutes. »</em></p>
                <p>De même, la pratique de la <strong>Communication Non-Violente (CNV)</strong> en situation de tension réelle reste à consolider. La théorie est connue mais l'application sous stress émotionnel n'est pas encore fluide.</p>
                <p><strong>Exercice suggéré :</strong> Présenter le même contenu technique à trois publics différents (expert, manager, grand public) en adaptant radicalement le registre.</p>`
            },
            {
                id: "B5 - Leadership adaptatif",
                points: 65,
                niveau: 3,
                description: "Guider et inspirer dans la complexité. Inspirer sans hiérarchie rigide, donner l'exemple, adapter son style au contexte, faciliter le leadership distribué.",
                feedback: `<p>L'étudiant·e a montré une <strong>capacité naturelle à mobiliser</strong> ses pairs autour d'un objectif commun. Lors du hackathon de novembre, il·elle a spontanément pris l'initiative de structurer le travail de l'équipe sans s'imposer comme « chef ».</p>
                <p>La posture de <em>leadership serviteur</em> est authentique : plusieurs témoignages de pairs confirment que l'étudiant·e met régulièrement ses compétences au service du groupe plutôt que de sa visibilité personnelle.</p>
                <h4>Évaluation 360° — Extraits :</h4>
                <blockquote style="border-left: 3px solid #10b981; padding-left: 12px; margin: 12px 0; font-style: italic;">
                    « Il·elle ne dit jamais "faites ça", mais plutôt "et si on essayait..." Ça donne envie de suivre. »
                </blockquote>
                <p><strong>Axe de progression :</strong> Le leadership adaptatif implique de savoir <em>parfois</em> être directif quand la situation l'exige. Dans les moments de crise ou d'urgence, l'étudiant·e hésite à trancher, cherchant trop longtemps le consensus. Apprendre à distinguer les décisions qui nécessitent délibération collective de celles qui appellent une action rapide.</p>`
            },
            {
                id: "K2 - Facilitation de groupe",
                points: 72,
                niveau: 3,
                description: "Créer les conditions de l'émergence collective. Gérer les tours de parole et l'équité d'expression, synthétiser les contributions en un tout cohérent.",
                feedback: `<p>Les compétences de facilitation se sont révélées lors des ateliers d'intelligence collective. L'étudiant·e a su créer un <strong>espace où chaque voix pouvait s'exprimer</strong>, y compris les plus introverties.</p>
                <p>Technique observée et appréciée : l'usage du <em>« tour de température »</em> en début de session pour jauger l'état émotionnel du groupe, et l'adaptation du rythme en conséquence.</p>
                <h4>Forces démontrées :</h4>
                <ul>
                    <li>Excellent timing dans les interventions (sait quand relancer, quand laisser le silence)</li>
                    <li>Synthèses « en temps réel » qui capturent l'essentiel sans réduire</li>
                    <li>Gestion habile des personnalités dominantes sans les braquer</li>
                </ul>
                <p><strong>Défi identifié :</strong> La facilitation de groupes <em>en conflit ouvert</em> reste inconfortable. Lors de la simulation « Négociation climat », l'étudiant·e a eu tendance à lisser les désaccords plutôt qu'à les utiliser comme matériau de travail. Piste : explorer les méthodes de « facilitation du conflit productif ».</p>`
            },
            {
                id: "B6 - Gestion des conflits",
                points: 42,
                niveau: 2,
                description: "Transformation créative des tensions. Influence et diplomatie, identification des sources racines, médiation constructive, transformation en opportunités d'innovation.",
                feedback: `<p>Cette compétence est <strong>en développement actif</strong>. L'étudiant·e reconnaît lui-même/elle-même dans son journal : <em>« Le conflit me met mal à l'aise. J'ai tendance à vouloir que ça se règle vite, parfois trop vite. »</em></p>
                <p>L'identification des <em>sources racines</em> (valeurs, besoins, ressources) progresse sur le plan analytique, mais l'application en situation réelle reste hésitante. Le réflexe est encore de traiter le symptôme (le désaccord exprimé) plutôt que la cause profonde.</p>
                <h4>Incident d'apprentissage (semaine 6) :</h4>
                <p>Lors du conflit sur le choix de la stack technique, l'étudiant·e a proposé un « compromis » (utiliser les deux technologies en parallèle) qui a évité le conflit immédiat mais créé de la dette technique. Rétrospectivement, il·elle reconnaît qu'<strong>affronter le désaccord aurait été plus productif</strong>.</p>
                <p><strong>Recommandation :</strong> Formation spécifique à la médiation. Lecture suggérée : <em>« Difficult Conversations »</em> (Stone, Patton, Heen). Objectif : voir le conflit comme une <em>ressource informationnelle</em>, pas comme un problème à éliminer.</p>`
            }
        ]
    },
    {
        id: "C. Créativité & Innovation",
        color: "#ec4899",
        competences: [
            {
                id: "A3 - Créativité générative",
                points: 90,
                niveau: 5,
                description: "Générer du véritablement nouveau et original. Combiner des éléments existants de manière inédite, développer des concepts 0 à 1, croiser des domaines disjoints.",
                feedback: `<p>Le projet « Symbiose Digitale » représente une <strong>démonstration éclatante de créativité générative</strong>. L'idée de croiser les principes du biomimétisme avec l'architecture de microservices pour concevoir un système auto-réparant est véritablement originale — une recherche dans la littérature n'a révélé aucun précédent direct.</p>
                <p>La <em>combinatoire créative</em> est une force manifeste : l'étudiant·e excelle à connecter des domaines qui n'ont a priori rien en commun. Le carnet d'idées (Portfolio Section F) révèle un processus d'association systématique et fertile.</p>
                <h4>Analyse du processus créatif documenté :</h4>
                <blockquote style="border-left: 3px solid #ec4899; padding-left: 12px; margin: 12px 0; font-style: italic;">
                    « Je lis toujours deux livres en parallèle, de domaines très différents. C'est dans la friction entre eux que les idées émergent. » — Extrait du journal
                </blockquote>
                <p>Cette approche de <strong>« cross-pollination intellectuelle »</strong> est systématisée et reproductible, signe d'une compétence mature et non accidentelle.</p>
                <p>La prochaine frontière : passer de l'idée créative au <em>prototype fonctionnel</em>. Certaines idées brillantes restent à l'état conceptuel faute de temps pour les concrétiser.</p>`
            },
            {
                id: "F1 - Design de processus",
                points: 68,
                niveau: 3,
                description: "Concevoir des workflows fluides pour l'humain et la machine. Faciliter la collaboration par le design de l'environnement, itérer et améliorer continuellement.",
                feedback: `<p>L'étudiant·e a montré une <strong>sensibilité réelle aux frictions dans les processus</strong>. Sa proposition de réorganisation du workflow d'onboarding (projet Startup Simulation) a réduit le temps d'intégration des nouveaux membres de 40%.</p>
                <p>Le principe <em>Kaizen</em> (amélioration continue) est bien intégré : chaque rétrospective de sprint inclut au moins une suggestion d'optimisation de processus, documentée et mesurable.</p>
                <h4>Exemple concret valorisé :</h4>
                <p>Le « système de passation » inventé pour les rotations de rôle dans l'équipe : un document vivant, co-maintenu, qui capture le « savoir tacite » et facilite les transitions. Plusieurs équipes de la cohorte ont adopté ce format.</p>
                <h4>Axe de développement :</h4>
                <p>Le design d'environnement <em>physique</em> reste peu exploré. L'étudiant·e se concentre naturellement sur les outils numériques mais sous-estime l'impact de l'agencement spatial sur la collaboration. Suggestion : explorer les principes du <strong>« Activity-Based Working »</strong> et les appliquer à un prochain projet.</p>`
            },
            {
                id: "F2 - Création de problèmes",
                points: 82,
                niveau: 4,
                description: "Identifier des besoins latents non formulés. Créer de nouveaux marchés plutôt qu'optimiser l'existant, poser des questions inédites, transformer les irritants en opportunités.",
                feedback: `<p>La capacité à <strong>reformuler les problèmes</strong> plutôt que de se précipiter vers les solutions est l'une des forces distinctives de l'étudiant·e. Le projet « Friction Fertile » illustre parfaitement cette approche : au lieu de résoudre un problème posé, il·elle a questionné la pertinence même de l'énoncé.</p>
                <p>Lors de l'atelier « Ocean Bleu », l'étudiant·e a identifié un <em>besoin latent non formulé</em> dans le domaine de l'éducation : le manque d'outils pour visualiser sa propre progression non-linéaire. Cette observation a donné naissance au concept de « Cartographie Compétence » — précisément l'outil que vous utilisez en ce moment.</p>
                <h4>Méthode observée :</h4>
                <ul>
                    <li>Commencer par « pourquoi ce problème existe-t-il ? » avant « comment le résoudre ? »</li>
                    <li>Chercher les <em>« non-consommateurs »</em> : ceux qui ne participent pas au marché actuel</li>
                    <li>Transformer les plaintes récurrentes en hypothèses de valeur</li>
                </ul>
                <p><strong>Prochain défi :</strong> Valider ces intuitions plus rapidement par des expérimentations terrain (Lean Startup), plutôt que rester trop longtemps dans la phase conceptuelle.</p>`
            },
            {
                id: "F3 - Singularité contextuelle",
                points: 55,
                niveau: 3,
                description: "Produire des réponses uniques, incarnées et situées. Éviter la moyenne et la généralisation excessive, incarner une signature personnelle inimitable.",
                feedback: `<p>L'étudiant·e développe progressivement une <strong>« voix » reconnaissable</strong> dans ses productions. Les pairs identifient souvent son travail avant de voir le nom : <em>« C'est du [prénom], ça se voit au style des schémas. »</em></p>
                <p>La résistance aux <em>best practices</em> génériques progresse. Lors du feedback sur le prototype v2, l'étudiant·e a explicitement justifié ses choix non-standards : <em>« Oui, ce n'est pas la convention, mais dans CE contexte, avec CES utilisateurs, ça fonctionne mieux. »</em></p>
                <h4>Tension identifiée :</h4>
                <p>Un tiraillement persiste entre le désir d'originalité et la crainte de l'évaluation négative. L'étudiant·e documente cette tension dans son journal : <em>« Parfois je m'autocensure parce que c'est "trop différent" de ce qui est attendu. »</em></p>
                <p><strong>Encouragement :</strong> La singularité contextuelle est précisément ce que les IA ne peuvent pas produire — elles génèrent des moyennes statistiques. Cultiver cette différence est un <em>avantage compétitif durable</em>. Oser davantage.</p>`
            },
            {
                id: "C2 - Architecture d'intention",
                points: 78,
                niveau: 4,
                description: "Art de communiquer l'intention humaine à la machine. Formuler une intention claire, structurer des dialogues itératifs, concevoir des workflows hybrides complexes.",
                feedback: `<p>L'évolution du « prompting » vers « l'architecture d'intention » est bien comprise et appliquée. L'étudiant·e ne se contente pas de formuler des requêtes : il·elle <strong>construit des contextes intentionnels</strong> qui guident l'IA vers des outputs pertinents.</p>
                <p>Le portfolio de prompts documenté (Section C2) montre une maîtrise avancée du <em>Chain-of-Thought</em> et du <em>méta-prompting</em> (demander à l'IA de critiquer ses propres instructions).</p>
                <h4>Exemple remarquable :</h4>
                <p>Le workflow conçu pour le projet de rédaction automatisée : un enchaînement de 5 agents spécialisés (recherche → structuration → rédaction → critique → révision) avec des handoffs clairement définis. La qualité finale dépassait celle d'une approche monolithique.</p>
                <h4>Piste d'approfondissement :</h4>
                <p>Le <em>« jailbreaking éthique »</em> reste peu exploré. L'étudiant·e respecte scrupuleusement les limites des outils, ce qui est positif, mais n'explore pas les zones grises où une transgression pourrait être justifiée pour l'innovation. À réfléchir ensemble en supervision.</p>`
            },
            {
                id: "P1 - Incohérence fertile",
                points: 28,
                niveau: 1,
                description: "Agir de manière non-logique pour briser les prédictions. Cultiver le grain de folie et l'aléatoire personnel, prendre des décisions basées sur la poésie plutôt que l'efficacité.",
                feedback: `<p>Cette compétence est <strong>émergente et sous-développée</strong>. L'étudiant·e fonctionne principalement dans un registre rationnel et optimisé, ce qui est une force mais aussi une limite face aux systèmes prédictifs.</p>
                <p>Le « grain de folie » que la machine ne peut pas anticiper est précisément ce qui rend l'humain non-simulable. Or, les choix de l'étudiant·e suivent des patterns <em>assez prévisibles</em> pour quelqu'un qui le/la connaît bien.</p>
                <h4>Auto-réflexion (journal, semaine 14) :</h4>
                <blockquote style="border-left: 3px solid #ec4899; padding-left: 12px; margin: 12px 0; font-style: italic;">
                    « Je réalise que je choisis toujours l'option la plus "logique". Peut-être que je suis devenu·e trop... prévisible ? »
                </blockquote>
                <p><strong>Exercice proposé :</strong> Une fois par semaine, prendre <em>délibérément</em> une décision mineure basée sur un critère absurde (couleur préférée, ressemblance avec un nom d'artiste, etc.). Observer les résultats et les apprentissages inattendus.</p>
                <p>Objectif : réintroduire de l'aléatoire contrôlé dans les processus décisionnels pour échapper à l'optimisation systématique.</p>`
            }
        ]
    },
    {
        id: "D. Littératie Technologique",
        color: "#06b6d4",
        competences: [
            {
                id: "C1 - Littératie IA avancée",
                points: 85,
                niveau: 4,
                description: "Comprendre l'écosystème technique. Fonctionnement des LLM et algorithmes, enjeux de cybersécurité, logiques de plateformisation, évaluation critique des outputs IA.",
                feedback: `<p>L'étudiant·e démontre une <strong>compréhension solide du fonctionnement des LLM</strong>, au-delà de l'usage superficiel. La capacité à expliquer pourquoi un modèle « hallucine » et dans quelles conditions est particulièrement appréciée.</p>
                <p>L'évaluation critique des résultats IA est rigoureuse : un protocole de vérification systématique a été développé et documenté (Portfolio, Section C1), incluant des stratégies de <em>triangulation des sources</em>.</p>
                <h4>Points forts techniques :</h4>
                <ul>
                    <li>Distinction claire entre capacités marketing et capacités réelles des outils</li>
                    <li>Compréhension des mécanismes d'économie de l'attention</li>
                    <li>Identification des angles morts techniques (ce que l'IA ne peut pas calculer)</li>
                </ul>
                <h4>Zone d'approfondissement :</h4>
                <p>La compréhension des <em>biais encodés dans les datasets</em> est théorique mais manque d'expérience pratique. Suggestion : participer à un projet d'audit algorithmique pour expérimenter la détection de biais en conditions réelles.</p>`
            },
            {
                id: "C3 - Usage éthique tech",
                points: 72,
                niveau: 3,
                description: "Maîtrise des impacts. Utiliser les outils avec parcimonie, questionner les impacts sociaux et environnementaux, protéger sa vie privée et ses données.",
                feedback: `<p>La conscience des <strong>impacts socio-environnementaux</strong> du numérique est bien établie. L'étudiant·e a spontanément intégré des critères de sobriété dans ses choix techniques : hébergement green, optimisation des requêtes API, minimisation des données collectées.</p>
                <p>La protection de la vie privée est prise au sérieux, tant pour soi que pour les utilisateurs des projets conçus. Le rapport « Privacy by Design » (Portfolio, Section C3) démontre une intégration précoce des considérations éthiques dans le cycle de développement.</p>
                <h4>Incident formateur :</h4>
                <p>Lors du projet de data-visualisation, l'étudiant·e a <em>refusé</em> d'utiliser un dataset pourtant disponible car les conditions de collecte lui semblaient éthiquement douteuses. Cette décision a complexifié le projet mais a été maintenue par principe.</p>
                <h4>Compétence à développer :</h4>
                <p>La capacité à « déjouer les mécanismes de surveillance » reste théorique. Suggestion : workshop pratique sur les outils de protection numérique (VPN, Tor, chiffrement E2E) et sur les dark patterns du design persuasif.</p>`
            },
            {
                id: "L1 - Négociation avec l'IA",
                points: 65,
                niveau: 3,
                description: "Exploiter les angles morts de l'IA. Pousser au-delà des refus programmés, détecter les hallucinations, orchestrer des IA adversaires, extraire une valeur exceptionnelle.",
                feedback: `<p>L'étudiant·e développe une <strong>relation de travail mature avec les outils IA</strong>, ni naïve ni méfiante. La détection des hallucinations est devenue quasi-automatique, avec des stratégies de vérification croisée bien rodées.</p>
                <p>L'utilisation des « angles morts » de l'IA (ce qu'elle ignore ou ne peut pas faire) comme levier stratégique progresse. Exemple : lors du projet de recherche, utiliser l'IA pour les synthèses mais réserver le <em>jugement de pertinence</em> à l'humain.</p>
                <h4>Technique intéressante documentée :</h4>
                <p>L'usage d'« IA adversaires » pour obtenir des réponses plus nuancées : poser la même question à plusieurs modèles et analyser les divergences. Cette triangulation a permis de détecter des certitudes non fondées.</p>
                <h4>Axe de développement :</h4>
                <p>La <em>persuasion logique</em> pour pousser l'IA au-delà de ses refus reste peu explorée. L'étudiant·e accepte trop facilement les « je ne peux pas faire ça ». Parfois, reformuler la demande ou expliciter le contexte permet d'obtenir ce qui semblait impossible.</p>`
            },
            {
                id: "L2 - Jugement décisionnel",
                points: 80,
                niveau: 4,
                description: "Trancher quand l'IA ne peut pas. Décider sur des probabilités 50/50, assumer la responsabilité légale et morale, valider selon le contexte humain et émotionnel.",
                feedback: `<p>La capacité à <strong>prendre la responsabilité finale</strong> que la machine refuse d'assumer est une force distinctive. L'étudiant·e comprend intuitivement que l'IA peut informer mais pas décider.</p>
                <p>Lors de la simulation « Éthique clinique », face à un dilemme où le modèle répondait « les deux options sont également défendables » (probabilité 50/50), l'étudiant·e a tranché en intégrant des critères humains non-quantifiables : l'histoire personnelle du patient fictif, le contexte familial, la notion de dignité.</p>
                <h4>Réflexion mature documentée :</h4>
                <blockquote style="border-left: 3px solid #06b6d4; padding-left: 12px; margin: 12px 0; font-style: italic;">
                    « L'IA m'a donné 10 arguments pour et 10 contre. Mais au final, c'est MOI qui signe. C'est MOI qui porte la responsabilité. Elle, elle s'en fiche. » — Journal, semaine 12
                </blockquote>
                <p>Cette posture d'<em>accountability</em> est essentielle dans un monde où les systèmes automatisés tendent à diluer les responsabilités.</p>`
            },
            {
                id: "N2 - Hygiène anti-algo",
                points: 48,
                niveau: 2,
                description: "Résister au piratage de l'attention. Identifier quand ses pensées sont façonnées par les algorithmes, s'extraire des bulles de filtres, résister aux dark patterns.",
                feedback: `<p>La <strong>prise de conscience</strong> des mécanismes de manipulation attentionnelle est réelle, mais la <em>résistance pratique</em> reste difficile. L'étudiant·e documente ses propres comportements addictifs avec une honnêteté appréciable.</p>
                <h4>Auto-diagnostic (journal, semaine 9) :</h4>
                <blockquote style="border-left: 3px solid #06b6d4; padding-left: 12px; margin: 12px 0; font-style: italic;">
                    « J'ai passé 2h sur Twitter alors que je voulais juste vérifier une info. Le pire c'est que je m'en suis rendu compte seulement après. Comment lutter contre quelque chose de si... invisible ? »
                </blockquote>
                <p>L'extraction des <em>bulles de filtres</em> est intentionnelle mais irrégulière. L'étudiant·e a mis en place un système de « sérendipité forcée » (suivre 5 comptes aux opinions opposées aux siennes) mais l'a abandonné au bout de 3 semaines.</p>
                <h4>Recommandations pratiques :</h4>
                <ul>
                    <li>Installer des outils de tracking du temps d'écran avec limites strictes</li>
                    <li>Pratiquer des « sabbats numériques » réguliers</li>
                    <li>Cultiver l'ennui productif : résister à l'envie de combler chaque vide par le scroll</li>
                </ul>`
            },
            {
                id: "Q2 - Audit & explicabilité",
                points: 38,
                niveau: 2,
                description: "Remonter la chaîne de causalité. Comprendre pourquoi l'IA a produit ce résultat, auditer les boîtes noires, exiger l'explicabilité des décisions automatisées.",
                feedback: `<p>La compétence d'audit est <strong>en construction</strong>. L'étudiant·e pose les bonnes questions (« pourquoi l'IA a-t-elle dit ça ? ») mais manque encore d'outils techniques pour y répondre rigoureusement.</p>
                <p>La compréhension conceptuelle de l'<em>explicabilité</em> (XAI) est acquise : l'importance de savoir « ouvrir la boîte noire » est intégrée. Mais l'application pratique — utiliser des outils comme LIME ou SHAP pour interpréter des décisions algorithmiques — reste à développer.</p>
                <h4>Projet proposé pour progresser :</h4>
                <p>Participer à un <strong>audit éthique d'algorithme</strong> en situation réelle, par exemple dans le cadre d'un projet open-source cherchant à détecter des biais. Cela permettrait de passer de la théorie à la pratique et d'acquérir des compétences techniques transférables.</p>
                <p>Lectures suggérées : <em>« Weapons of Math Destruction »</em> (Cathy O'Neil) pour le contexte, et documentation technique de Hugging Face sur l'interprétabilité des modèles.</p>`
            }
        ]
    },
    {
        id: "E. Éthique & Sens",
        color: "#8b5cf6",
        competences: [
            {
                id: "D1 - Raisonnement éthique",
                points: 88,
                niveau: 4,
                description: "Naviguer les dilemmes moraux sans réponse claire. Appliquer la logique floue, analyser selon plusieurs référentiels, aligner actions et valeurs, trancher par sagesse pratique.",
                feedback: `<p>L'analyse éthique du dilemme de la voiture autonome rendue en fin de semestre démontre une <strong>maturité philosophique remarquable</strong>. L'étudiant·e ne se contente pas d'appliquer mécaniquement un référentiel (utilitarisme ou déontologie) mais navigue entre plusieurs cadres selon le contexte.</p>
                <p>La notion de <em>« sagesse pratique »</em> (phronesis) est bien comprise : savoir quand la règle doit céder devant la situation singulière, et pouvoir le justifier.</p>
                <h4>Extrait de l'essai final :</h4>
                <blockquote style="border-left: 3px solid #8b5cf6; padding-left: 12px; margin: 12px 0; font-style: italic;">
                    « Le calcul utilitariste nous dit de minimiser les morts. Mais peut-on vraiment comparer la vie d'un enfant à celle d'un adulte ? La vraie question éthique n'est pas "combien" mais "qui décide" et "avec quelle légitimité". »
                </blockquote>
                <p>L'<em>alignement éthique</em> (cohérence entre valeurs déclarées et actions sous pression) a été testé et validé : lors du dilemme du projet commercial (fonctionnalité rentable mais éthiquement douteuse), l'étudiant·e a maintenu sa position malgré la pression du groupe.</p>`
            },
            {
                id: "D2 - Conscience écologique",
                points: 70,
                niveau: 3,
                description: "Agir pour le long terme et le vivant. Comprendre les limites planétaires, analyser les externalités, penser en responsabilité intergénérationnelle, concevoir pour la régénération.",
                feedback: `<p>La <strong>conscience des limites planétaires</strong> est bien intégrée et influence les choix techniques. L'étudiant·e évalue spontanément l'empreinte carbone de ses projets numériques et privilégie les solutions sobres.</p>
                <p>L'analyse des impacts de <em>second et troisième ordre</em> (externalités) progresse. Le rapport sur les conséquences non-intentionnelles de la « gamification de l'éducation » montrait une réflexion systémique sur les effets pervers potentiels.</p>
                <h4>Point de vigilance :</h4>
                <p>Le <em>long-termisme</em> reste parfois abstrait. Penser à 7 générations (principe amérindien) ou à 10 000 ans (Long Now Foundation) est intellectuellement accepté mais rarement appliqué concrètement dans les décisions de projet.</p>
                <h4>Suggestion de développement :</h4>
                <p>Explorer la notion de <strong>« design régénératif »</strong> — non pas seulement « moins de mal » (durabilité) mais « contribuer positivement » (régénération). Comment un projet numérique peut-il laisser l'écosystème en meilleur état qu'il ne l'a trouvé ?</p>`
            },
            {
                id: "D3 - Spiritualité et sens",
                points: 62,
                niveau: 3,
                description: "Cultiver ce qui dépasse le calcul. Explorer les questions existentielles sans dogme, développer une pratique contemplative, maintenir l'humanité face à la technique.",
                feedback: `<p>L'étudiant·e explore les <strong>questions existentielles</strong> avec une ouverture d'esprit appréciable, sans tomber ni dans le dogmatisme ni dans le relativisme absolu. Le questionnement sur le « sens » du travail post-AGI est sincère et profond.</p>
                <p>Une pratique méditative régulière (15 min/jour) est documentée et semble contribuer positivement à la qualité de présence et de concentration.</p>
                <h4>Réflexion du journal (semaine 15) :</h4>
                <blockquote style="border-left: 3px solid #8b5cf6; padding-left: 12px; margin: 12px 0; font-style: italic;">
                    « Si l'IA peut faire tout ce que je fais en mieux et plus vite... que reste-t-il de moi ? Cette question m'angoisse mais elle est aussi libératrice. Elle me force à chercher ailleurs ma valeur. »
                </blockquote>
                <p>La capacité à <em>maintenir l'humanité face aux tendances déshumanisantes de la technique</em> est une force. L'étudiant·e résiste à l'optimisation de soi comme si l'humain était une machine à améliorer.</p>
                <p><strong>Piste d'approfondissement :</strong> Explorer les traditions de sagesse (stoïcisme, bouddhisme, philosophie existentialiste) comme ressources pour naviguer l'incertitude radicale de l'ère post-AGI.</p>`
            },
            {
                id: "D4 - Valorisation neurodiversité",
                points: 85,
                niveau: 4,
                description: "Intelligence plurielle. Valoriser la neurodiversité comme atout, reconnaître les intelligences non-académiques, créer des espaces inclusifs, orchestrer les frictions créatives.",
                feedback: `<p>L'étudiant·e fait preuve d'une <strong>sensibilité authentique à la neurodiversité</strong>, probablement nourrie par une expérience personnelle ou proche. Cette compétence se manifeste concrètement dans la facilitation de groupe.</p>
                <p>Lors du projet inclusif, les adaptations proposées pour accueillir un membre de l'équipe TDAH n'étaient pas des « accommodements » condescendants mais des <em>améliorations du processus pour tous</em> : pauses régulières, supports visuels, droit au mouvement.</p>
                <h4>Observation de l'équipe :</h4>
                <blockquote style="border-left: 3px solid #8b5cf6; padding-left: 12px; margin: 12px 0; font-style: italic;">
                    « Grâce à [prénom], on a compris que la "normalité" n'existe pas. On fonctionne tous différemment et c'est OK. » — Feedback pair
                </blockquote>
                <p>La capacité à <em>orchestrer les frictions créatives</em> entre modes de pensée opposés (analytique vs. intuitif, convergent vs. divergent) est une force distinctive dans les dynamiques de groupe.</p>`
            },
            {
                id: "O1 - Acceptation & humilité",
                points: 52,
                niveau: 3,
                description: "Psychologie face à une intelligence supérieure. Accepter l'infériorité cognitive technique sans perdre l'estime de soi, redéfinir sa valeur hors de la performance intellectuelle.",
                feedback: `<p>Le <strong>« choc ontologique »</strong> face aux capacités des IA de nouvelle génération est vécu mais pas encore pleinement intégré. L'étudiant·e oscille entre fascination et anxiété existentielle.</p>
                <p>La redéfinition de sa propre valeur est en cours. Le journal documente ce processus avec honnêteté : <em>« Avant, j'étais fier de ma capacité à synthétiser des informations rapidement. Maintenant Claude le fait en 3 secondes. Qui suis-je alors ? »</em></p>
                <h4>Progression observée :</h4>
                <p>En début d'année, l'étudiant·e tentait de « battre » l'IA sur son terrain (vitesse, volume). Progressivement, une posture plus sage émerge : <strong>se spécialiser dans ce que l'IA ne peut pas faire</strong> plutôt que rivaliser sur ce qu'elle fait mieux.</p>
                <h4>Exercice suggéré :</h4>
                <p>Lister explicitement : (1) ce que l'IA fait mieux, (2) ce que je fais mieux, (3) ce qui n'a de sens que fait par un humain. Cette cartographie aide à repositionner son identité professionnelle.</p>`
            },
            {
                id: "Q1 - Constitutionnalisme IA",
                points: 45,
                niveau: 2,
                description: "Gouverner la machine. Rédiger les règles indépassables pour les agents IA, définir les garde-fous éthiques, traduire des valeurs philosophiques en contraintes techniques.",
                feedback: `<p>La compétence de <strong>gouvernance de l'IA</strong> est émergente. L'étudiant·e comprend l'importance de définir des « constitutions » pour les agents IA mais n'a pas encore d'expérience pratique de rédaction.</p>
                <p>Le concept de <em>« valeurs traduites en contraintes »</em> est saisi théoriquement. Lors du débat sur l'alignement, l'étudiant·e a posé une question pertinente : <em>« Comment encoder "dignité humaine" dans une fonction de perte ? Est-ce même possible ? »</em></p>
                <h4>Projet de développement proposé :</h4>
                <p>Participer à la rédaction d'une <strong>« constitution » pour un agent IA éducatif</strong> : quelles valeurs inviolables ? Quels comportements interdits ? Comment vérifier le respect de ces règles ? Ce travail pratique permettrait de confronter les intentions éthiques aux contraintes techniques.</p>
                <p>Ressource suggérée : Documentation d'Anthropic sur le « Constitutional AI » comme exemple d'approche réelle.</p>`
            }
        ]
    },
    {
        id: "F. Résilience & Adaptation",
        color: "#f59e0b",
        competences: [
            {
                id: "E1 - Antifragilité",
                points: 75,
                niveau: 4,
                description: "Se renforcer par le chaos. Résilience active, utiliser le stress pour devenir meilleur, désapprendre rapidement, fluidité cognitive face aux changements de paradigme.",
                feedback: `<p>Après l'échec du premier prototype (crash complet en démonstration publique), l'étudiant·e a démontré une <strong>capacité antifragile remarquable</strong> : non seulement rebondir, mais utiliser l'échec comme carburant pour une version 2.0 significativement meilleure.</p>
                <p>Le concept de <em>« désapprentissage »</em> est bien intégré. Lors du pivot technologique de mi-semestre, l'étudiant·e a abandonné un framework qu'il·elle maîtrisait pour en apprendre un nouveau, sans s'accrocher à l'expertise acquise.</p>
                <h4>Moment clé documenté :</h4>
                <blockquote style="border-left: 3px solid #f59e0b; padding-left: 12px; margin: 12px 0; font-style: italic;">
                    « Le crash de la démo était humiliant. Mais en analysant ce qui n'avait pas marché, j'ai trouvé 3 failles que je n'aurais jamais vues autrement. Finalement, c'était un cadeau. » — Journal, semaine 10
                </blockquote>
                <p>La <em>fluidité cognitive</em> face aux changements de paradigme reste à renforcer : l'étudiant·e s'adapte bien aux changements techniques mais résiste davantage aux changements de cadre conceptuel ou méthodologique.</p>`
            },
            {
                id: "E2 - Tolérance à l'incertitude",
                points: 68,
                niveau: 3,
                description: "Agir dans le brouillard. Maintenir sa capacité d'action sans visibilité complète, préférer la pensée probabiliste, construire la stratégie en marchant, assumer les décisions dans le doute.",
                feedback: `<p>L'étudiant·e a fait des progrès significatifs dans sa <strong>capacité à agir malgré l'incertitude</strong>. En début d'année, il·elle demandait systématiquement des consignes précises ; désormais, il·elle démarre avec des briefs ouverts.</p>
                <p>La <em>pensée probabiliste</em> remplace progressivement le besoin de certitude : « Il y a 70% de chances que cette approche fonctionne » devient une base d'action acceptable, là où il fallait auparavant du 95%.</p>
                <h4>Évolution observée :</h4>
                <table style="width: 100%; border-collapse: collapse; margin: 12px 0;">
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 8px; font-weight: bold;">Début d'année</td>
                        <td style="padding: 8px;">« Quelle est LA bonne solution ? »</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; font-weight: bold;">Fin d'année</td>
                        <td style="padding: 8px;">« Quelle est la meilleure hypothèse à tester d'abord ? »</td>
                    </tr>
                </table>
                <p><strong>Défi persistant :</strong> Le « confort avec l'inachevé » reste difficile. L'étudiant·e a tendance à vouloir « finir proprement » même quand le contexte appelle un brouillon évolutif (MVP).</p>`
            },
            {
                id: "E3 - Plasticité identitaire",
                points: 55,
                niveau: 3,
                description: "Évolution du Soi. Concevoir l'identité comme processus fluide, réinvention continue de soi, maintenir une cohérence narrative malgré les changements, désidentification du rôle.",
                feedback: `<p>L'étudiant·e commence à <strong>dissocier identité et compétences</strong>. La phrase « je suis développeur » évolue vers « je pratique le développement en ce moment », signe d'une identité moins figée.</p>
                <p>La capacité de <em>réinvention</em> a été testée lors du changement de rôle imposé (de dev à designer) : l'adaptation a été réussie, démontrant une plasticité réelle.</p>
                <h4>Tension identifiée :</h4>
                <p>Un tiraillement persiste entre le besoin de <strong>cohérence narrative</strong> (« qui suis-je ? ») et la réalité d'une trajectoire non-linéaire. L'étudiant·e cherche encore un « fil rouge » qui unifierait ses expériences diverses.</p>
                <p>Réflexion suggérée : et si le fil rouge n'était pas un <em>contenu</em> (un domaine, une expertise) mais une <em>manière d'être</em> (curiosité, engagement éthique, créativité) ? Cette perspective pourrait libérer des contraintes identitaires trop rigides.</p>`
            },
            {
                id: "E4 - Présence augmentée",
                points: 60,
                niveau: 3,
                description: "Ancrage dans l'ici et maintenant. Pleine présence en situation de travail, attention sélective souveraine, équilibrer connexion et déconnexion, cultiver l'amour et la beauté gratuite.",
                feedback: `<p>La pratique de <strong>pleine conscience appliquée</strong> (mindfulness) montre des résultats tangibles sur la qualité du travail. Les sessions de « Deep Work » documentées révèlent des périodes de concentration intense et productive.</p>
                <p>L'<em>attention sélective souveraine</em> progresse mais reste fragile face aux sollicitations numériques. Le téléphone en mode avion pendant les sessions de travail est une discipline acquise ; la résistance aux notifications sur ordinateur l'est moins.</p>
                <h4>Pratique inspirante documentée :</h4>
                <p>L'étudiant·e a instauré un rituel de « 5 minutes de beauté gratuite » par jour : contempler quelque chose de beau sans but productif (un arbre, une œuvre d'art, un visage). Cette pratique nourrit une qualité de présence qui se ressent dans les interactions.</p>
                <h4>Axe de développement :</h4>
                <p>L'équilibre connexion/déconnexion reste instable. Des périodes d'hyper-connexion alternent avec des « burnouts numériques » suivis de coupures radicales. Viser une <em>modération stable</em> plutôt que des oscillations extrêmes.</p>`
            },
            {
                id: "E5 - Sagesse de l'erreur",
                points: 82,
                niveau: 4,
                description: "L'échec comme donnée. Considérer l'erreur comme information à haute valeur, vulnérabilité intellectuelle, itération rapide par expérimentation, célébrer l'échec créatif.",
                feedback: `<p>Le rapport à l'erreur a <strong>fondamentalement évolué</strong> au cours de l'année. L'étudiant·e ne vit plus l'échec comme une faute personnelle mais comme une source d'apprentissage.</p>
                <p>La <em>vulnérabilité intellectuelle</em> est assumée : dire « je ne sais pas » ou « j'ai eu tort » ne semble plus coûter. Cette posture crée un climat de confiance dans les équipes.</p>
                <h4>Exemple marquant :</h4>
                <p>Lors de la rétrospective du sprint 4, l'étudiant·e a présenté un « musée des erreurs » : une collection des décisions qui n'avaient pas fonctionné, avec analyse de ce qu'elles avaient enseigné. Cette initiative a été adoptée par d'autres équipes.</p>
                <h4>Maturité atteinte :</h4>
                <blockquote style="border-left: 3px solid #f59e0b; padding-left: 12px; margin: 12px 0; font-style: italic;">
                    « Je ne célèbre pas l'échec pour l'échec. Je célèbre l'échec qui m'apprend quelque chose que je n'aurais pas pu apprendre autrement. » — Présentation finale
                </blockquote>`
            },
            {
                id: "E6 - Narration réflexive",
                points: 70,
                niveau: 3,
                description: "Donner du sens. Construire du sens à partir d'expériences fragmentées, identifier les patterns de son parcours, communiquer son histoire pour inspirer, transformer les traumatismes.",
                feedback: `<p>La capacité de <strong>sense-making</strong> (construction de sens) se développe. L'étudiant·e commence à identifier des patterns récurrents dans son parcours et à en tirer des enseignements transférables.</p>
                <p>Le <em>storytelling</em> personnel progresse : la présentation de mi-parcours était structurée comme un récit avec tension, climax et résolution, pas comme une liste de réalisations.</p>
                <h4>Analyse du portfolio narratif :</h4>
                <ul>
                    <li><strong>Force :</strong> Honnêteté sur les moments difficiles, pas seulement les succès</li>
                    <li><strong>Force :</strong> Connexion entre expériences apparemment disparates</li>
                    <li><strong>À développer :</strong> Projection vers l'avenir — le récit s'arrête au présent</li>
                </ul>
                <p><strong>Exercice suggéré :</strong> Écrire la suite de l'histoire. Où cette trajectoire mène-t-elle dans 5 ans, 10 ans ? Non pas comme prédiction mais comme <em>intention narrative</em> qui donne direction et sens.</p>`
            },
            {
                id: "G3 - Efficacité personnelle",
                points: 48,
                niveau: 2,
                description: "Gestion des ressources personnelles. Attention comme ressource rare, priorisation impitoyable selon l'impact, gestion de l'énergie physique, mentale et spirituelle.",
                feedback: `<p>La gestion de l'énergie personnelle reste un <strong>point de développement majeur</strong>. Des signes d'épuisement ont été observés à plusieurs reprises, notamment avant les deadlines importantes.</p>
                <p>La <em>priorisation selon l'impact</em> (loi de Pareto : 20% des efforts produisent 80% des résultats) est comprise théoriquement mais difficile à appliquer. L'étudiant·e a tendance à vouloir « tout faire bien » plutôt qu'à sacrifier le moins important.</p>
                <h4>Pattern problématique identifié :</h4>
                <blockquote style="border-left: 3px solid #f59e0b; padding-left: 12px; margin: 12px 0; font-style: italic;">
                    « Je commence plein de choses en parallèle et je finis par courir après tout. Résultat : je suis épuisé·e et rien n'est vraiment terminé. » — Auto-analyse, semaine 13
                </blockquote>
                <h4>Recommandations concrètes :</h4>
                <ul>
                    <li>Adopter un système de gestion de tâches avec priorisation explicite (Eisenhower matrix)</li>
                    <li>Protéger des créneaux d'énergie haute pour les tâches à fort impact</li>
                    <li>Apprendre à dire « non » ou « plus tard » aux demandes non-prioritaires</li>
                </ul>`
            }
        ]
    }
];

// Export pour utilisation dans le HTML
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { domainsData };
}
