-- 014 — Applique la décision tarifaire : contribution Twin9 à +20 % (2026-07-15).
-- Le nouveau défaut du code est 1.2, mais la config Twin9 avait été PERSISTÉE
-- avec l'ancien défaut 1.1 lors de l'import — une valeur stockée l'emporte sur
-- le défaut. Ce correctif de données bascule le `marge` stocké à 1.2, UNIQUEMENT
-- s'il est encore sous 1.2 (l'ancien 1.1) : on n'écrase jamais une valeur admin
-- volontairement plus élevée, et la ligne absente reste sur le défaut (déjà 1.2).
-- `marge_twin6` et `twin9_cle_perso_ouverte` ne sont pas dans la config stockée :
-- ils suivent déjà les nouveaux défauts (1.1 / false), rien à faire.
UPDATE settings
SET value = JSON_SET(value, '$.marge', 1.2)
WHERE name = 'twin9_config'
  AND JSON_EXTRACT(value, '$.marge') < 1.2;
